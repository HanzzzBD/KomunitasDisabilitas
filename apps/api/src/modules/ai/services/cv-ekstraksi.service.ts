// modules/ai — ekstraksi transkrip → draft CV (PR-067, dijalankan worker
// `ai-extract-resume`; SDD §7.3, risiko T5).
//
// ALUR, DAN KENAPA TIDAK ADA DRAFT RUSAK YANG BISA TERSIMPAN:
//   1. Keluaran model divalidasi `resumeContentInputSchema` — kontrak yang SAMA
//      dengan jalur manual (PR-060) — SEBELUM apa pun ditulis.
//   2. Gagal → SATU kali lagi dengan daftar masalahnya ("perbaikan").
//   3. Gagal lagi → sesi kembali `active` dengan penanda gagal (keputusan owner
//      2026-09-28), notifikasi `resume.draft_ai_gagal`. Pengguna tidak buntu:
//      formulir manual + transkrip, atau lanjut chat lalu finalize ulang.
//   Satu-satunya jalan ke `resumes.create` melewati `safeParse` yang sukses.
//
// KUOTA. Jatah `cv_finalize` SUDAH dipotong API saat enqueue (keputusan owner:
// 1 jatah per finalize). Reservasinya ikut di payload dan diteruskan ke
// `AiClient` sebagai `ctx.reservasi`, jadi dua panggilan LLM di sini tidak
// memotong lagi. Jatah DIKEMBALIKAN hanya bila percobaan TERAKHIR job gagal
// karena provider — sebelum itu, BullMQ masih akan mencoba lagi di atas jatah
// yang sama.
//
// IDEMPOTEN PER SESI. Draft dibuat dengan id = id sesi. Job yang di-retry
// setelah draft tersimpan (tetapi sebelum sesi ditandai `finalized`) menemukan
// draft itu dan hanya menyelesaikan penandaannya — tidak ada draft kedua.
import {
  resumeContentInputSchema,
  type AiExtractResumeJob,
  type ResumeContent,
} from "@nawasena/schemas";
import type { ZodIssue } from "zod";
import {
  AiProviderError,
  type AiClient,
  type AiQuota,
  type PromptTemplate,
  type CvExtractorInput,
} from "../../../core/ai/index.js";
import { AppError } from "../../../core/http/index.js";
import type { Logger } from "../../../core/logger/index.js";
import type {
  ChatSessionRow,
  ChatSessionsRepository,
} from "../repositories/chat-sessions.repository.js";

/** Bagian service CV yang dipakai — lewat lapisan SERVICE modul resumes (ADR-001). */
export interface CvTujuan {
  get(actor: { userId: string }, id: string): Promise<unknown>;
  create(
    actor: { userId: string },
    input: { title: string; content: ResumeContent },
    createdVia: "ai_chat",
    opsi: { id: string },
  ): Promise<{ id: string }>;
}

/** Bagian service notifikasi yang dipakai. */
export interface PenerbitNotifikasi {
  terbitkan(
    opsi:
      | {
          userId: string;
          type: "resume.draft_ai_siap";
          params: { resumeId: string };
          kunciPeristiwa: string;
        }
      | {
          userId: string;
          type: "resume.draft_ai_gagal";
          params: { sessionId: string };
          kunciPeristiwa: string;
        },
  ): Promise<boolean>;
}

export type HasilEkstraksi =
  | { status: "draft"; resumeId: string; percobaanLlm: number }
  | { status: "gagal"; kode: string }
  | { status: "dilewati"; sebab: "sesi-hilang" | "bukan-finalizing" };

export interface CvEkstraksiServiceDeps {
  repo: ChatSessionsRepository;
  ai: Pick<AiClient, "prompt">;
  quota: Pick<AiQuota, "kembalikanBila">;
  resumes: CvTujuan;
  notifikasi: PenerbitNotifikasi;
  template: PromptTemplate<CvExtractorInput, unknown>;
  logger: Pick<Logger, "warn" | "error">;
  clock?: () => Date;
}

export interface CvEkstraksiService {
  /**
   * `percobaanTerakhir` = ini percobaan BullMQ terakhir. Kegagalan provider
   * sebelum itu DILEMPAR (supaya BullMQ mencoba lagi); pada percobaan terakhir
   * ia diturunkan menjadi kegagalan ekstraksi yang terlihat pengguna.
   */
  jalankan(job: AiExtractResumeJob, opsi: { percobaanTerakhir: boolean }): Promise<HasilEkstraksi>;
}

/** Transkrip → teks untuk prompt. Label peran KITA; isinya tetap dibungkus template. */
export function formatPercakapan(sesi: Pick<ChatSessionRow, "transcript">): string {
  return sesi.transcript
    .map((t) => `${t.role === "assistant" ? "Pewawancara" : "Pengguna"}: ${t.content}`)
    .join("\n");
}

/**
 * Masalah validasi → teks perbaikan untuk model. Jalur + pesan dari skema KITA;
 * dibatasi 20 butir supaya keluaran yang rusak total tidak menjadi prompt raksasa.
 */
export function teksPerbaikan(masalah: readonly ZodIssue[]): string {
  const butir = masalah.slice(0, 20).map((m) => `- ${m.path.join(".") || "(akar)"}: ${m.message}`);
  const sisa = masalah.length > 20 ? [`- …dan ${String(masalah.length - 20)} masalah lain`] : [];
  return [...butir, ...sisa].join("\n");
}

/**
 * Bagian yang TIDAK boleh datang dari model, dibuang sebelum validasi:
 * `contact` (tidak diekstrak — lihat kepala `cv-extractor.v1.ts`) dan
 * `schemaVersion` (milik kita, diisi default skema).
 */
function tanpaBagianTerlarang(nilai: unknown): unknown {
  if (typeof nilai !== "object" || nilai === null || Array.isArray(nilai)) return nilai;
  const { contact: _contact, schemaVersion: _versi, ...sisa } = nilai as Record<string, unknown>;
  return sisa;
}

/** Judul draft — tanggal WIB, supaya dua draft dari hari berbeda bisa dibedakan. */
function judulDraft(now: Date): string {
  const tanggal = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(now);
  return `CV dari percakapan AI (${tanggal})`;
}

export function createCvEkstraksiService(deps: CvEkstraksiServiceDeps): CvEkstraksiService {
  const { repo, ai, quota, resumes, notifikasi, template, logger } = deps;
  const now = deps.clock ?? (() => new Date());

  type Coba = { ok: true; content: ResumeContent } | { ok: false; masalah: readonly ZodIssue[] };

  async function coba(
    job: AiExtractResumeJob,
    percakapan: string,
    perbaikan: string | null,
  ): Promise<Coba> {
    let mentah: unknown;
    try {
      const jawaban = await ai.prompt(
        { userId: job.userId, feature: "cv_finalize", reservasi: job.reservasi },
        template,
        { percakapan, perbaikan, tahunSekarang: now().getUTCFullYear() },
      );
      mentah = jawaban.data;
    } catch (err) {
      // Keluaran yang bukan JSON sama sekali adalah KELUARAN RUSAK, bukan
      // provider tumbang — ia masuk jalur perbaikan, tidak dilempar.
      if (err instanceof AiProviderError && err.code === "AI_INVALID_OUTPUT") {
        return {
          ok: false,
          masalah: [
            { code: "custom", path: [], message: "Keluaran harus satu objek JSON yang sah" },
          ],
        };
      }
      throw err;
    }
    const hasil = resumeContentInputSchema.safeParse(tanpaBagianTerlarang(mentah));
    return hasil.success
      ? { ok: true, content: hasil.data as ResumeContent }
      : { ok: false, masalah: hasil.error.issues };
  }

  async function gagal(job: AiExtractResumeJob, kode: string): Promise<HasilEkstraksi> {
    const saat = now();
    const berpindah = await repo.gagalFinalisasi(job.userId, job.sessionId, kode, saat);
    if (berpindah) {
      // Kunci memuat waktu: tiap finalize yang gagal adalah peristiwa sendiri.
      await notifikasi.terbitkan({
        userId: job.userId,
        type: "resume.draft_ai_gagal",
        params: { sessionId: job.sessionId },
        kunciPeristiwa: `${job.sessionId}:gagal:${saat.toISOString()}`,
      });
    }
    // Kode saja di log — tidak ada isi transkrip, tidak ada keluaran model.
    logger.warn({ sessionId: job.sessionId, kode }, "Ekstraksi CV gagal — sesi kembali aktif");
    return { status: "gagal", kode };
  }

  async function simpanDraft(job: AiExtractResumeJob, content: ResumeContent): Promise<string> {
    const actor = { userId: job.userId };
    // Idempotensi: draft ber-id sesi mungkin sudah dibuat percobaan sebelumnya.
    try {
      await resumes.get(actor, job.sessionId);
      return job.sessionId;
    } catch (err) {
      if (!(err instanceof AppError && err.code === "CV_TIDAK_DITEMUKAN")) throw err;
    }
    const cv = await resumes.create(actor, { title: judulDraft(now()), content }, "ai_chat", {
      id: job.sessionId,
    });
    return cv.id;
  }

  return {
    async jalankan(job, opsi) {
      const sesi = await repo.findOwned(job.userId, job.sessionId);
      if (sesi === null) return { status: "dilewati", sebab: "sesi-hilang" };
      if (sesi.status !== "finalizing") {
        // `finalized` (job ganda) atau `active` (dibatalkan / sudah gagal):
        // tidak ada yang perlu dikerjakan, dan menulis apa pun akan salah.
        return { status: "dilewati", sebab: "bukan-finalizing" };
      }

      try {
        const percakapan = formatPercakapan(sesi);
        let hasil = await coba(job, percakapan, null);
        let percobaanLlm = 1;
        if (!hasil.ok) {
          hasil = await coba(job, percakapan, teksPerbaikan(hasil.masalah));
          percobaanLlm = 2;
        }
        if (!hasil.ok) return await gagal(job, "AI_INVALID_OUTPUT");

        const resumeId = await simpanDraft(job, hasil.content);
        await repo.selesaiFinalisasi(job.userId, job.sessionId, resumeId, now());
        await notifikasi.terbitkan({
          userId: job.userId,
          type: "resume.draft_ai_siap",
          params: { resumeId },
          // Satu kabar per sesi, apa pun jumlah retry-nya.
          kunciPeristiwa: `${job.sessionId}:siap`,
        });
        return { status: "draft", resumeId, percobaanLlm };
      } catch (err) {
        // Batas lima CV bisa tercapai di antara enqueue dan job ini (CV manual
        // dibuat sementara itu). Keadaan akun, bukan kegagalan server — dan
        // tidak akan membaik dengan retry.
        if (err instanceof AppError && err.code === "BATAS_CV_TERCAPAI") {
          return gagal(job, err.code);
        }
        if (!opsi.percobaanTerakhir) throw err; // BullMQ mencoba lagi
        if (err instanceof AiProviderError) {
          // Pengguna tidak menerima apa pun karena provider — jatahnya pulang.
          await quota.kembalikanBila(job.reservasi, err);
          return gagal(job, err.code);
        }
        // Tak terduga (DB, bug): tandai gagal supaya sesi tidak tersangkut
        // `finalizing`, lalu lempar ulang supaya job berakhir di DLQ, terlihat.
        logger.error(
          { err, sessionId: job.sessionId },
          "Ekstraksi CV gagal tanpa sebab yang dikenal",
        );
        await gagal(job, "TERJADI_KESALAHAN");
        throw err;
      }
    },
  };
}
