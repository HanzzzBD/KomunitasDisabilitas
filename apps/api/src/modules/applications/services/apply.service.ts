// modules/applications — melamar dengan Disclosure Control (PR-075, PRD US-11).
//
// URUTANNYA ADALAH KEPUTUSAN, BUKAN KEBETULAN:
//
//   1. batas laju        — sebelum apa pun bekerja (pola kuota ekspor PDP);
//   2. klaim idempotensi — `SET NX`: retry dengan kunci sama berhenti di sini;
//   3. lowongan & CV     — keduanya divalidasi SEBELUM data sensitif disentuh,
//                          jadi lamaran yang pasti gagal tidak pernah membaca
//                          profil disabilitas siapa pun;
//   4. snapshot          — HANYA bila pelamar memilih mengungkap; dibaca lewat
//                          `bacaSensitif` tujuan `disclosure` (selalu berjejak),
//                          disalin, lalu dienkripsi. Salinan, bukan referensi:
//                          profil yang berubah kemudian tidak mengubah lamaran;
//   5. insert            — unique (user, job) adalah wasit terakhir;
//   6. audit + event     — sesudah barisnya pasti ada.
//
// REDIS BOLEH MATI. Lamaran adalah North Star; menolaknya karena cache sedang
// sakit akan menukar metrik utama produk dengan kenyamanan "putar ulang 201".
// Tanpa Redis, lapis kedua (unique DB) tetap menjamin satu lamaran.
import {
  AUDIT_ACTION,
  disclosureSnapshotSchema,
  type ApplyJob,
  type Application,
  type SeekerProfile,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { EventBus } from "../../../core/events/index.js";
import type { EncryptedField, FieldCrypto } from "../../../core/crypto/index.js";
import type { Logger } from "../../../core/logger/index.js";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import {
  SudahMelamarError,
  type ApplicationRow,
  type ApplicationsRepository,
} from "../repositories/applications.repository.js";
import type { IdempotensiRepository } from "../repositories/idempotensi.repository.js";

export const AUDIT_ENTITY = "applications";

export const APPLY_POLICY = {
  /** SDD §5.3: Idempotency-Key disimpan 24 jam. */
  idempotensiDetik: 24 * 60 * 60,
  /** Batas laju per pengguna — jauh di atas pelamar sungguhan, jauh di bawah skrip. */
  maksPerJendela: 30,
  jendelaDetik: 60 * 60,
} as const;

/**
 * Alasan pembacaan sensitif tujuan `disclosure`. KONSTANTA: tidak memuat
 * identitas, kondisi, atau id siapa pun (aturan `reason` di
 * docs/akses-data-sensitif.md) — `entityId` baris auditnya sudah menunjuk
 * subjeknya, dan `requestId` menautkannya ke baris APPLICATION_SUBMITTED.
 */
export const ALASAN_AKSES_PENGUNGKAPAN =
  "pengungkapan sukarela oleh pelamar saat mengirim lamaran (PR-075)";

export interface ApplicationsActor {
  userId: string;
  requestId: string;
}

export interface ApplyServiceDeps {
  applicationsRepository: Pick<ApplicationsRepository, "create" | "adaUntuk" | "findOwned">;
  idempotensi: IdempotensiRepository;
  crypto: Pick<FieldCrypto, "encryptJson">;
  auditLog: AuditLog;
  events: Pick<EventBus, "emit">;
  /** Melempar `LOWONGAN_TIDAK_DITEMUKAN` bila lowongan tidak published/aktif. */
  pastikanLowonganAktif(jobId: string): Promise<void>;
  /** Melempar `CV_TIDAK_DITEMUKAN` bila CV tidak ada atau milik orang lain. */
  pastikanCvMilik(actor: ApplicationsActor, resumeId: string): Promise<void>;
  /** `sensitiveAccess.bacaSensitif(actor, actor.userId, { purpose: "disclosure", … })`. */
  bacaProfilUntukPengungkapan(actor: ApplicationsActor): Promise<SeekerProfile | null>;
  logger: Pick<Logger, "warn">;
  clock?: () => Date;
}

export interface HasilApply {
  application: Application;
  /** true = respons diputar ulang dari Idempotency-Key yang sama. */
  replay: boolean;
}

function keKontrak(row: ApplicationRow): Application {
  return {
    id: row.id,
    jobId: row.jobId,
    resumeId: row.resumeId,
    discloseDisability: row.discloseDisability,
    status: row.status,
    appliedAt: row.appliedAt.toISOString(),
  };
}

export function createApplyService(deps: ApplyServiceDeps) {
  const { applicationsRepository: repo, idempotensi, logger } = deps;
  const now = deps.clock ?? (() => new Date());

  /** Redis yang gagal dicatat lalu DIABAIKAN — lihat kepala berkas. */
  async function lunak<T>(langkah: string, kerja: () => Promise<T>, cadangan: T): Promise<T> {
    try {
      return await kerja();
    } catch (err) {
      logger.warn({ err, langkah }, "Redis apply tidak terjangkau — lanjut tanpa lapis ini");
      return cadangan;
    }
  }

  async function buatSnapshot(actor: ApplicationsActor): Promise<EncryptedField> {
    const profil = await deps.bacaProfilUntukPengungkapan(actor);
    const sensitif = profil?.sensitive ?? null;
    if (
      sensitif === null ||
      (sensitif.disabilityTypes.length === 0 &&
        sensitif.accommodationNeeds.tags.length === 0 &&
        sensitif.accommodationNeeds.notes === null)
    ) {
      throw appError("DATA_DISABILITAS_KOSONG");
    }

    // Di-parse ulang, bukan disebar: bentuk yang tersimpan adalah kontrak
    // bersama dengan pembacanya kelak (PR-077), dan field tambahan apa pun yang
    // suatu saat ikut di `sensitive` tidak boleh menumpang masuk diam-diam.
    const snapshot = disclosureSnapshotSchema.parse({
      disabilityTypes: sensitif.disabilityTypes,
      accommodationNeeds: sensitif.accommodationNeeds,
      capturedAt: now().toISOString(),
    });
    return deps.crypto.encryptJson(snapshot);
  }

  /** Putar ulang hasil kunci yang sudah pernah dipakai (klaim gagal). */
  async function putarUlang(
    actor: ApplicationsActor,
    jobId: string,
    idempotencyKey: string,
  ): Promise<HasilApply> {
    const catatan = await idempotensi.baca(actor.userId, idempotencyKey);
    if (catatan !== null && catatan.jobId !== jobId) throw appError("IDEMPOTENCY_KEY_BENTROK");
    // Catatan tanpa `applicationId` = permintaan pertama masih bekerja. Catatan
    // yang hilang di antara klaim dan baca (kedaluwarsa tepat di detik itu)
    // diperlakukan sama: klien mencoba lagi dan kali ini menang klaim.
    if (catatan === null || catatan.applicationId === null) {
      throw appError("LAMARAN_SEDANG_DIPROSES");
    }
    const row = await repo.findOwned(actor.userId, catatan.applicationId);
    if (row === null) throw appError("LAMARAN_SEDANG_DIPROSES");
    return { application: keKontrak(row), replay: true };
  }

  return {
    /** POST /jobs/:id/apply. */
    async apply(
      actor: ApplicationsActor,
      jobId: string,
      input: ApplyJob,
      idempotencyKey: string,
    ): Promise<HasilApply> {
      const laju = await lunak(
        "laju",
        () => idempotensi.bumpLaju(actor.userId, APPLY_POLICY.jendelaDetik),
        null,
      );
      if (laju !== null && laju.value > APPLY_POLICY.maksPerJendela) {
        throw appError("TERLALU_BANYAK_PERMINTAAN", {
          message: "Anda sudah mengirim banyak lamaran dalam waktu singkat",
          hint: "Tunggu sebentar, lalu coba lagi",
          retryAfterSeconds: laju.resetInSeconds,
        });
      }

      // `null` = Redis tidak terjangkau: lanjut tanpa lapis pertama.
      const klaim = await lunak(
        "klaim",
        () => idempotensi.klaim(actor.userId, idempotencyKey, jobId, APPLY_POLICY.idempotensiDetik),
        null,
      );
      if (klaim === false) return putarUlang(actor, jobId, idempotencyKey);

      try {
        await deps.pastikanLowonganAktif(jobId);
        await deps.pastikanCvMilik(actor, input.resumeId);
        if (await repo.adaUntuk(actor.userId, jobId)) throw new SudahMelamarError();

        const snapshot = input.discloseDisability ? await buatSnapshot(actor) : null;
        const row = await repo.create({
          id: uuidV7(),
          userId: actor.userId,
          jobId,
          resumeId: input.resumeId,
          discloseDisability: input.discloseDisability,
          disclosureSnapshot: snapshot,
        });

        deps.auditLog(
          { actorId: actor.userId, requestId: actor.requestId },
          AUDIT_ACTION.APPLICATION_SUBMITTED,
          AUDIT_ENTITY,
          row.id,
          { jobId, disclosed: row.discloseDisability },
        );
        deps.events.emit("application.submitted", {
          applicationId: row.id,
          userId: actor.userId,
          jobId,
          submittedAt: row.appliedAt.toISOString(),
        });

        if (klaim === true) {
          await lunak(
            "selesaikan",
            () =>
              idempotensi.selesaikan(
                actor.userId,
                idempotencyKey,
                { jobId, applicationId: row.id },
                APPLY_POLICY.idempotensiDetik,
              ),
            undefined,
          );
        }
        return { application: keKontrak(row), replay: false };
      } catch (err) {
        // Klaim dilepas supaya retry dengan kunci yang sama bisa bekerja —
        // kegagalan (lowongan tutup, CV terhapus, data kosong) bukan hasil
        // yang pantas diputar ulang selama 24 jam.
        if (klaim === true) {
          await lunak("lepas", () => idempotensi.lepas(actor.userId, idempotencyKey), undefined);
        }
        if (err instanceof SudahMelamarError) throw appError("SUDAH_MELAMAR");
        throw err;
      }
    },
  };
}

export type ApplyService = ReturnType<typeof createApplyService>;
