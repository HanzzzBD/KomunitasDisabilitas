// modules/applications — "Lamaran Saya": daftar, detail, withdraw, confirm-hired
// (PR-076, PRD FR-5.3/FR-5.5, North Star).
//
// Identitas pelamar SELALU dari sesi; setiap bacaan & tulisan menyaring
// `userId`, jadi lamaran orang lain berperilaku seperti lamaran yang tidak ada.
//
// SETIAP TRANSISI = compare-and-set atas (status, updatedAt) yang dibaca. Riwayat
// JSONB dihitung dari baris itu lalu ditulis utuh; penulis lain di antaranya
// (klik ganda, admin yang bersamaan) membuat tulisan ini gagal → 409, bukan
// riwayat yang saling menimpa.
import {
  AUDIT_ACTION,
  type ApplicationStatus,
  type MyApplication,
  type MyApplicationDetail,
  type MyApplicationListResponse,
  type MyApplicationListQuery,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { EventBus } from "../../../core/events/index.js";
import type { Logger } from "../../../core/logger/index.js";
import { appError } from "../../../core/http/index.js";
import { decodeKursor, encodeKursor } from "../../../core/pagination/index.js";
import type {
  ApplicationDetailRow,
  ApplicationsRepository,
  PerubahanLamaran,
} from "../repositories/applications.repository.js";
import { AUDIT_ENTITY, type ApplicationsActor } from "./apply.service.js";
import { bolehPindah } from "./status-machine.js";
import { createPemetaLamaran, type RingkasanLowongan } from "./pemeta-lamaran.js";

export type { RingkasanLowongan } from "./pemeta-lamaran.js";

export interface StatusServiceDeps {
  applicationsRepository: Pick<ApplicationsRepository, "listMine" | "findOwnedDetail" | "perbarui">;
  /** `jobsService.ringkasanUntukLamaran` — termasuk lowongan yang sudah tutup. */
  ringkasanLowongan(ids: readonly string[]): Promise<RingkasanLowongan[]>;
  auditLog: AuditLog;
  events: Pick<EventBus, "emit">;
  logger: Pick<Logger, "error">;
  clock?: () => Date;
}

export function createStatusService(deps: StatusServiceDeps) {
  const { applicationsRepository: repo } = deps;
  const now = deps.clock ?? (() => new Date());

  const { keRiwayat, keLamaran } = createPemetaLamaran(deps);

  async function keDetail(row: ApplicationDetailRow): Promise<MyApplicationDetail> {
    const [ringkas] = await keLamaran([row]);
    return { ...(ringkas as MyApplication), statusHistory: keRiwayat(row) };
  }

  async function milik(actor: ApplicationsActor, id: string): Promise<ApplicationDetailRow> {
    const row = await repo.findOwnedDetail(actor.userId, id);
    if (row === null) throw appError("LAMARAN_TIDAK_DITEMUKAN");
    return row;
  }

  /** Tulis perubahan CAS; gagal = keadaan berubah sejak dibaca → 409. */
  async function tulis(
    actor: ApplicationsActor,
    row: ApplicationDetailRow,
    perubahan: PerubahanLamaran,
  ): Promise<void> {
    const berhasil = await repo.perbarui(
      actor.userId,
      row.id,
      { status: row.status, updatedAt: row.updatedAt },
      perubahan,
    );
    if (!berhasil) throw appError("STATUS_LAMARAN_TIDAK_VALID");
  }

  function entri(dari: ApplicationStatus, ke: ApplicationStatus, at: Date) {
    return { from: dari, to: ke, by: "seeker" as const, at: at.toISOString() };
  }

  function terbitkanPerpindahan(
    actor: ApplicationsActor,
    row: ApplicationDetailRow,
    ke: ApplicationStatus,
    at: Date,
  ): void {
    deps.auditLog(
      { actorId: actor.userId, requestId: actor.requestId },
      AUDIT_ACTION.APPLICATION_STATUS_CHANGED,
      AUDIT_ENTITY,
      row.id,
      { from: row.status, to: ke },
    );
    deps.events.emit("application.status_changed", {
      applicationId: row.id,
      userId: actor.userId,
      jobId: row.jobId,
      from: row.status,
      to: ke,
      changedBy: "seeker",
      changedAt: at.toISOString(),
    });
  }

  return {
    /** GET /me/applications — terbaru berubah lebih dulu, cursor keyset. */
    async list(
      actor: ApplicationsActor,
      query: MyApplicationListQuery,
    ): Promise<MyApplicationListResponse> {
      const posisi = query.cursor === undefined ? undefined : decodeKursor(query.cursor);
      const rows = await repo.listMine(
        actor.userId,
        query.limit + 1,
        posisi === undefined ? undefined : { updatedAt: posisi.sortAt, id: posisi.id },
        query.job_id,
      );
      const adaLagi = rows.length > query.limit;
      const halaman = adaLagi ? rows.slice(0, query.limit) : rows;
      const terakhir = halaman.at(-1);
      return {
        data: await keLamaran(halaman),
        meta: {
          nextCursor:
            adaLagi && terakhir !== undefined
              ? encodeKursor({ sortAt: terakhir.updatedAt, id: terakhir.id })
              : null,
        },
      };
    },

    /** GET /me/applications/:id — dengan riwayat status. */
    async detail(actor: ApplicationsActor, id: string): Promise<MyApplicationDetail> {
      return keDetail(await milik(actor, id));
    },

    /** POST /me/applications/:id/withdraw — hanya dari status aktif. */
    async withdraw(actor: ApplicationsActor, id: string): Promise<MyApplicationDetail> {
      const row = await milik(actor, id);
      if (!bolehPindah(row.status, "withdrawn", "seeker")) {
        throw appError("STATUS_LAMARAN_TIDAK_VALID");
      }
      const at = now();
      await tulis(actor, row, {
        status: "withdrawn",
        statusHistory: [...keRiwayat(row), entri(row.status, "withdrawn", at)],
      });
      terbitkanPerpindahan(actor, row, "withdrawn", at);
      return keDetail(await milik(actor, id));
    },

    /**
     * POST /me/applications/:id/confirm-hired — North Star (PRD FR-5.5).
     *
     * Dari `offered`: status ikut pindah ke `hired` (keputusan owner
     * 2026-10-02). Dari `hired`: hanya mengesahkan keputusan admin. Sudah
     * terkonfirmasi: jawaban yang sama tanpa event kedua — tombol "Saya
     * diterima" yang ditekan dua kali tidak boleh menggandakan penempatan.
     */
    async confirmHired(actor: ApplicationsActor, id: string): Promise<MyApplicationDetail> {
      const row = await milik(actor, id);
      if (row.hiredConfirmedAt !== null) return keDetail(row);
      if (row.status !== "offered" && row.status !== "hired") {
        throw appError("STATUS_LAMARAN_TIDAK_VALID");
      }

      const at = now();
      try {
        await tulis(
          actor,
          row,
          row.status === "offered"
            ? {
                status: "hired",
                statusHistory: [...keRiwayat(row), entri("offered", "hired", at)],
                hiredConfirmedAt: at,
              }
            : { hiredConfirmedAt: at },
        );
      } catch (err) {
        // Klik ganda yang kalah balapan: bila pemenangnya sudah mengonfirmasi,
        // jawabannya sama — bukan 409 yang membuat pelamar mengira gagal.
        const terkini = await milik(actor, id);
        if (terkini.hiredConfirmedAt !== null) return keDetail(terkini);
        throw err;
      }

      if (row.status === "offered") terbitkanPerpindahan(actor, row, "hired", at);
      deps.auditLog(
        { actorId: actor.userId, requestId: actor.requestId },
        AUDIT_ACTION.APPLICATION_HIRED_CONFIRMED,
        AUDIT_ENTITY,
        row.id,
        { from: row.status },
      );
      deps.events.emit("application.hired_confirmed", {
        applicationId: row.id,
        userId: actor.userId,
        jobId: row.jobId,
        confirmedAt: at.toISOString(),
      });
      return keDetail(await milik(actor, id));
    },
  };
}

export type StatusService = ReturnType<typeof createStatusService>;
