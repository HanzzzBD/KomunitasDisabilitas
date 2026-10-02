// modules/applications — operasional lamaran oleh admin (PR-077a, PRD FR-5.3).
//
// Model operasi MVP: admin menjembatani perusahaan partner. Ia butuh nama,
// kontak, dan CV pelamar (keputusan owner 2026-10-02) untuk meneruskan
// lamaran, lalu memindahkan statusnya sesuai kabar perusahaan.
//
// DATA DISABILITAS TIDAK PERNAH IKUT DI DAFTAR MAUPUN DETAIL. Lamaran yang
// diungkap hanya membawa penanda `discloseDisability`; isinya dibuka lewat
// `bukaPengungkapan` dengan alasan tertulis, dan jejaknya ditulis SEBELUM
// ciphertext dibaca — pola `bacaSensitif` (docs/akses-data-sensitif.md):
// penolakan sesudah membaca adalah penolakan kosmetik.
//
// Diletakkan di modul `applications`, bukan `modules/admin/applications` seperti
// tertulis di dokumen PR: endpoint admin lain (companies, jobs) juga hidup di
// modul domainnya, dan modul admin terpisah harus membaca tabel `applications`
// lewat repository lintas modul — yang dilarang lint boundaries.
import {
  AUDIT_ACTION,
  disclosureSnapshotSchema,
  type AdminApplication,
  type AdminApplicationDetail,
  type AdminApplicationListQuery,
  type AdminApplicationListResponse,
  type DisclosureSnapshot,
  type Resume,
  type UpdateApplicationStatus,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { EventBus } from "../../../core/events/index.js";
import type { FieldCrypto } from "../../../core/crypto/index.js";
import { AppError, appError } from "../../../core/http/index.js";
import { decodeKursor, encodeKursor } from "../../../core/pagination/index.js";
import type {
  ApplicationAdminRow,
  ApplicationsRepository,
} from "../repositories/applications.repository.js";
import { AUDIT_ENTITY } from "./apply.service.js";
import type { PemetaLamaran } from "./pemeta-lamaran.js";
import { bolehPindah } from "./status-machine.js";

export interface AdminActor {
  userId: string;
  requestId: string;
}

interface Identitas {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

export interface AdminApplicationsServiceDeps {
  applicationsRepository: Pick<
    ApplicationsRepository,
    "listAdmin" | "findForAdmin" | "perbaruiOlehAdmin" | "bacaSnapshot"
  >;
  pemeta: PemetaLamaran;
  /** Modul users — hanya akun aktif yang kembali. */
  identitas(ids: readonly string[]): Promise<Identitas[]>;
  /** Modul resumes — CV milik `userId`; melempar `CV_TIDAK_DITEMUKAN` bila hilang. */
  bacaCv(userId: string, resumeId: string): Promise<Resume>;
  crypto: Pick<FieldCrypto, "decryptJson">;
  auditLog: AuditLog;
  events: Pick<EventBus, "emit">;
  clock?: () => Date;
}

export function createAdminApplicationsService(deps: AdminApplicationsServiceDeps) {
  const { applicationsRepository: repo, pemeta } = deps;
  const now = deps.clock ?? (() => new Date());

  async function ambil(id: string): Promise<ApplicationAdminRow> {
    const row = await repo.findForAdmin(id);
    if (row === null) throw appError("LAMARAN_TIDAK_DITEMUKAN");
    return row;
  }

  async function keDetail(row: ApplicationAdminRow): Promise<AdminApplicationDetail> {
    const [[ringkas], [orang]] = await Promise.all([
      pemeta.keLamaran([row]),
      deps.identitas([row.userId]),
    ]);
    let resume: Resume | null = null;
    if (row.resumeId !== null) {
      try {
        resume = await deps.bacaCv(row.userId, row.resumeId);
      } catch (err) {
        // CV yang dilampirkan dijaga FK NoAction, jadi hilangnya hanya mungkin
        // bila akunnya sedang dihapus. Detail tetap tampil tanpa CV.
        if (!(err instanceof AppError && err.code === "CV_TIDAK_DITEMUKAN")) throw err;
      }
    }
    return {
      ...ringkas!,
      statusHistory: pemeta.keRiwayat(row),
      applicant: {
        userId: row.userId,
        fullName: orang?.fullName ?? null,
        phone: orang?.phone ?? null,
        email: orang?.email ?? null,
      },
      resume,
    };
  }

  return {
    /** GET /admin/applications — filter lowongan/status, cursor. */
    async list(query: AdminApplicationListQuery): Promise<AdminApplicationListResponse> {
      const posisi = query.cursor === undefined ? undefined : decodeKursor(query.cursor);
      const rows = await repo.listAdmin(
        { jobId: query.job_id, status: query.status },
        query.limit + 1,
        posisi === undefined ? undefined : { updatedAt: posisi.sortAt, id: posisi.id },
      );
      const adaLagi = rows.length > query.limit;
      const halaman = adaLagi ? rows.slice(0, query.limit) : rows;
      const terakhir = halaman.at(-1);

      const [lamaran, orang] = await Promise.all([
        pemeta.keLamaran(halaman),
        deps.identitas([...new Set(halaman.map((r) => r.userId))]),
      ]);
      const nama = new Map(orang.map((o) => [o.id, o.fullName]));
      const data: AdminApplication[] = lamaran.map((l, i) => {
        const userId = halaman[i]!.userId;
        return { ...l, applicant: { userId, fullName: nama.get(userId) ?? null } };
      });

      return {
        data,
        meta: {
          nextCursor:
            adaLagi && terakhir !== undefined
              ? encodeKursor({ sortAt: terakhir.updatedAt, id: terakhir.id })
              : null,
        },
      };
    },

    /** GET /admin/applications/:id — kontak + CV + riwayat, TANPA data disabilitas. */
    async detail(id: string): Promise<AdminApplicationDetail> {
      return keDetail(await ambil(id));
    },

    /**
     * PUT /admin/applications/:id/status — atas nama perusahaan partner.
     * Aturan transisi dari mesin status yang sama dengan jalur pelamar.
     */
    async ubahStatus(
      actor: AdminActor,
      id: string,
      input: UpdateApplicationStatus,
    ): Promise<AdminApplicationDetail> {
      const row = await ambil(id);
      if (!bolehPindah(row.status, input.status, "admin")) {
        throw appError("STATUS_LAMARAN_TIDAK_VALID");
      }
      const at = now();
      const berhasil = await repo.perbaruiOlehAdmin(
        row.id,
        { status: row.status, updatedAt: row.updatedAt },
        {
          status: input.status,
          statusHistory: [
            ...pemeta.keRiwayat(row),
            { from: row.status, to: input.status, by: "admin", at: at.toISOString() },
          ],
        },
      );
      if (!berhasil) throw appError("STATUS_LAMARAN_TIDAK_VALID");

      deps.auditLog(
        { actorId: actor.userId, requestId: actor.requestId },
        AUDIT_ACTION.APPLICATION_STATUS_CHANGED,
        AUDIT_ENTITY,
        row.id,
        { from: row.status, to: input.status, reason: input.reason },
      );
      deps.events.emit("application.status_changed", {
        applicationId: row.id,
        userId: row.userId,
        jobId: row.jobId,
        from: row.status,
        to: input.status,
        changedBy: "admin",
        changedAt: at.toISOString(),
      });
      return keDetail(await ambil(id));
    },

    /**
     * POST /admin/applications/:id/disclosure — buka salinan yang diungkap.
     *
     * Jejak ditulis LEBIH DULU, bahkan bila lamarannya tidak ada atau tidak
     * diungkap: kalau hanya pembukaan yang berhasil yang tercatat, menyisir
     * lamaran mana yang ber-disclose menjadi gratis.
     */
    async bukaPengungkapan(
      actor: AdminActor,
      id: string,
      reason: string,
    ): Promise<DisclosureSnapshot> {
      deps.auditLog(
        { actorId: actor.userId, requestId: actor.requestId },
        AUDIT_ACTION.APPLICATION_DISCLOSURE_READ,
        AUDIT_ENTITY,
        id,
        { reason },
      );
      const baris = await repo.bacaSnapshot(id);
      if (baris === null) throw appError("LAMARAN_TIDAK_DITEMUKAN");
      if (!baris.discloseDisability || baris.disclosureSnapshot === null) {
        throw appError("DATA_TIDAK_DIUNGKAP");
      }
      return disclosureSnapshotSchema.parse(
        deps.crypto.decryptJson(Buffer.from(baris.disclosureSnapshot)),
      );
    },
  };
}

export type AdminApplicationsService = ReturnType<typeof createAdminApplicationsService>;
