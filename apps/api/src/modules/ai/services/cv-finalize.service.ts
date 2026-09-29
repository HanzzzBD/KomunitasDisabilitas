// modules/ai — finalize sesi AI CV Builder: sisi API (PR-067).
//
// `POST /ai/cv-chat/:session/finalize` hanya MEMULAI ekstraksi: memeriksa,
// memotong SATU jatah `cv_finalize` (keputusan owner 2026-09-28), memindahkan
// sesi `active → finalizing`, lalu mengantre `ai-extract-resume`. Pekerjaannya
// sendiri milik worker (`cv-ekstraksi.service.ts`) — panggilan LLM ber-retry
// tidak pantas menahan permintaan HTTP di jaringan 3G.
//
// URUTAN PEMERIKSAAN DISENGAJA: semua yang GRATIS (sesi, aliran, isi, batas CV)
// lebih dulu, baru kuota. Finalize yang pasti ditolak tidak boleh sempat
// memakan jatah — dan tidak boleh mengandalkan refund untuk memperbaikinya.
//
// IDEMPOTEN: finalize kedua saat `finalizing` → 202 yang sama, saat `finalized`
// → 200 dengan `resumeId`. Keduanya tanpa kuota, tanpa job kedua.
import {
  QUEUE_NAME,
  type AiCvChatFinalizeResult,
  type AiExtractResumeJob,
} from "@nawasena/schemas";
import { DegradedError, type AiQuota } from "../../../core/ai/index.js";
import { appError } from "../../../core/http/index.js";
import { buildJobId, type QueueRegistry } from "../../../core/queue/index.js";
import type { ChatSessionsRepository } from "../repositories/chat-sessions.repository.js";
import type { RegistriAliran } from "./cv-chat-aliran.js";
import type { AiChatActor } from "./chat-sessions.service.js";

/** Port antrean ekstraksi — dipisah supaya test tidak butuh BullMQ. */
export interface CvEkstraksiJobs {
  enqueue(job: AiExtractResumeJob, now: Date): Promise<void>;
}

/**
 * Produser `ai-extract-resume`. `jobId` memuat waktu mulai: finalize ULANG
 * setelah ekstraksi gagal adalah pekerjaan baru, dan BullMQ akan diam-diam
 * menolak job berid sama selama job lama masih tersimpan (`removeOnFail`).
 */
export function createCvEkstraksiJobs(queues: Pick<QueueRegistry, "enqueue">): CvEkstraksiJobs {
  return {
    async enqueue(job, now) {
      await queues.enqueue(QUEUE_NAME.AI_EXTRACT_RESUME, job, {
        jobId: buildJobId("ai-extract", job.sessionId, now.getTime()),
      });
    },
  };
}

export interface CvFinalizeServiceDeps {
  repo: ChatSessionsRepository;
  registri: Pick<RegistriAliran, "sedangBerjalan">;
  quota: Pick<AiQuota, "periksaDanPakai" | "kembalikan">;
  /** Hitung CV pemilik — lewat service modul resumes (ADR-001), bukan repository-nya. */
  cv: { jumlah(actor: AiChatActor): Promise<number> };
  /** `env.RESUME_MAX_PER_USER` — batas yang SAMA dengan jalur manual. */
  maksCv: number;
  jobs: CvEkstraksiJobs;
  /** `env.AI_CV_CHAT_ENABLED`. */
  aktif: boolean;
  clock?: () => Date;
}

export interface CvFinalizeService {
  /** `baru` true = ekstraksi baru saja dimulai (202); false = sudah berjalan/selesai. */
  finalisasi(actor: AiChatActor, sessionId: string): Promise<AiCvChatFinalizeResult>;
}

export function createCvFinalizeService(deps: CvFinalizeServiceDeps): CvFinalizeService {
  const { repo, registri, quota, cv, maksCv, jobs } = deps;
  const now = deps.clock ?? (() => new Date());

  return {
    async finalisasi(actor, sessionId) {
      if (!deps.aktif) throw new DegradedError("AI_CHAT_DIMATIKAN");

      const sesi = await repo.findOwned(actor.userId, sessionId);
      if (sesi === null) throw appError("AI_SESI_TIDAK_DITEMUKAN");
      if (sesi.status === "finalized") {
        return { sessionId, status: "finalized", resumeId: sesi.resumeId };
      }
      if (sesi.status === "finalizing") return { sessionId, status: "finalizing", resumeId: null };

      if (registri.sedangBerjalan(sessionId)) throw appError("AI_SEDANG_MENJAWAB");
      if (!sesi.transcript.some((t) => t.role === "user")) throw appError("AI_SESI_KOSONG");
      if ((await cv.jumlah(actor)) >= maksCv) {
        throw appError("BATAS_CV_TERCAPAI", {
          message: `Anda hanya bisa menyimpan ${String(maksCv)} CV`,
          hint: "Hapus salah satu CV lama, lalu buat draft dari percakapan ini lagi",
        });
      }

      // Melempar `DegradedError` KUOTA_AI_HABIS (429 + Retry-After) — JSON,
      // sebab belum ada aliran yang dibuka.
      const reservasi = await quota.periksaDanPakai({
        userId: actor.userId,
        feature: "cv_finalize",
      });

      const saat = now();
      const mulai = await repo.mulaiFinalisasi(actor.userId, sessionId, saat);
      if (mulai !== "ok") {
        // Finalize serentak lain menang lebih dulu: jatah permintaan ini pulang.
        await quota.kembalikan(reservasi);
        if (mulai === "tidak-ada") throw appError("AI_SESI_TIDAK_DITEMUKAN");
        const terkini = await repo.findOwned(actor.userId, sessionId);
        return mulai === "selesai"
          ? { sessionId, status: "finalized", resumeId: terkini?.resumeId ?? null }
          : { sessionId, status: "finalizing", resumeId: null };
      }

      try {
        await jobs.enqueue(
          {
            sessionId,
            userId: actor.userId,
            reservasi: {
              hari: reservasi.hari,
              userId: reservasi.userId,
              feature: "cv_finalize",
              tercatat: reservasi.tercatat,
              global: reservasi.global,
            },
          },
          saat,
        );
      } catch (err) {
        // Antrean tidak menerima: finalize TIDAK PERNAH dimulai. Sesi kembali
        // `active` tanpa jejak gagal (tidak ada ekstraksi yang gagal), dan
        // jatahnya pulang — pengguna tidak menerima apa pun.
        await repo.batalFinalisasi(actor.userId, sessionId, now());
        await quota.kembalikan(reservasi);
        throw err;
      }
      return { sessionId, status: "finalizing", resumeId: null };
    },
  };
}
