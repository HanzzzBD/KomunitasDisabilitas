// modules/ai — service sesi AI CV Builder (PR-065, PRD FR-3.1).
//
// KONTRAK SESI UNTUK PR-066. Endpoint SSE (`POST /ai/cv-chat`) memakai tiga
// fungsi di sini: `mulaiAtauLanjutkan` saat percakapan dibuka, `tambahGiliran`
// untuk pesan pengguna dan untuk jawaban AI yang sudah utuh. Hanya `get` yang
// punya endpoint di PR ini — sesi tidak bisa lahir atau bertambah lewat HTTP
// kecuali lewat jalur yang juga memotong kuota.
//
// `userId` SELALU dari sesi login, TIDAK PERNAH dari input — aturan yang sama
// dengan `resumes.service.ts`. Tidak ada fungsi di berkas ini yang punya
// parameter untuk menyebut pengguna lain.
//
// TRANSKRIP TANPA DATA SENSITIF PROFIL. Service ini tidak membaca profil sama
// sekali, dan `GiliranBaru` hanya punya `role` + `content`: tidak ada jalur bagi
// ragam disabilitas atau kebutuhan akomodasi (ADR-007, terenkripsi) untuk
// DISALIN ke kolom jsonb polos ini. Yang ditulis pengguna dengan kata-katanya
// sendiri adalah miliknya — ikut diekspor, dan dihapus retensi 30 hari.
import {
  AI_CHAT_LIMITS,
  aiChatTurnSchema,
  type AiChatSession,
  type AiChatTurn,
} from "@nawasena/schemas";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import type {
  BatasTranskrip,
  ChatSessionRow,
  ChatSessionsRepository,
} from "../repositories/chat-sessions.repository.js";

/** Identitas pemanggil — disusun controller dari sesi, tidak pernah dari body. */
export interface AiChatActor {
  userId: string;
}

/**
 * Yang boleh ditambahkan pemanggil. SENGAJA hanya dua field — `seq` dan `at`
 * milik server, dan tidak ada field lain yang bisa membawa data profil masuk.
 */
export type GiliranBaru = Pick<AiChatTurn, "role" | "content">;

const giliranBaruSchema = aiChatTurnSchema.pick({ role: true, content: true }).strict();

/** Baris DB → kontrak API. Eksplisit, supaya kolom baru tak punya jalan keluar sendiri. */
function keSesi(row: ChatSessionRow): AiChatSession {
  return {
    id: row.id,
    status: row.status,
    turns: row.transcript,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finalizedAt: row.finalizedAt === null ? null : row.finalizedAt.toISOString(),
    resumeId: row.resumeId,
    extractionFailedAt:
      row.extractionFailedAt === null ? null : row.extractionFailedAt.toISOString(),
    extractionError: row.extractionError,
  };
}

export interface AiChatSessionsServiceDeps {
  repo: ChatSessionsRepository;
  /** Bawaan `AI_CHAT_LIMITS`; disuntik test supaya batas bisa dicapai tanpa 120 giliran. */
  batas?: BatasTranskrip;
  clock?: () => Date;
}

export interface AiChatSessionsService {
  /** 404 `AI_SESI_TIDAK_DITEMUKAN` bila tidak ada ATAU milik orang lain. */
  get(actor: AiChatActor, sessionId: string): Promise<AiChatSession>;
  /**
   * Sesi aktif pemanggil — dibuat bila belum ada. `baru` memberi tahu PR-066
   * apakah perlu membuka dengan salam atau melanjutkan dari giliran terakhir.
   */
  mulaiAtauLanjutkan(actor: AiChatActor): Promise<{ session: AiChatSession; baru: boolean }>;
  /** Giliran yang tersimpan, lengkap dengan `seq` dari database. */
  tambahGiliran(actor: AiChatActor, sessionId: string, giliran: GiliranBaru): Promise<AiChatTurn>;
  /** Seluruh sesi milik `userId` untuk berkas ekspor PDP. */
  semuaUntukEkspor(userId: string): Promise<AiChatSession[]>;
}

export function createAiChatSessionsService(
  deps: AiChatSessionsServiceDeps,
): AiChatSessionsService {
  const { repo } = deps;
  const batas: BatasTranskrip = deps.batas ?? {
    maxTurns: AI_CHAT_LIMITS.maxTurns,
    maxTranscriptBytes: AI_CHAT_LIMITS.maxTranscriptBytes,
  };
  const now = deps.clock ?? (() => new Date());

  return {
    async get(actor, sessionId) {
      const row = await repo.findOwned(actor.userId, sessionId);
      if (row === null) throw appError("AI_SESI_TIDAK_DITEMUKAN");
      return keSesi(row);
    },

    async mulaiAtauLanjutkan(actor) {
      // id tidak pernah dari klien — id pilihan klien bisa ditebak dan ditabrak.
      const { row, baru } = await repo.createOrGetActive(actor.userId, uuidV7(), now());
      return { session: keSesi(row), baru };
    },

    async tambahGiliran(actor, sessionId, giliran) {
      // Divalidasi DI SINI, bukan hanya di router PR-066: jawaban AI juga masuk
      // lewat fungsi ini, dan ia tidak melewati validator HTTP mana pun.
      const hasil = giliranBaruSchema.safeParse(giliran);
      if (!hasil.success) {
        throw appError("VALIDATION_ERROR", {
          hint: `Pesan harus berisi 1–${String(AI_CHAT_LIMITS.maxContentChars)} karakter`,
        });
      }

      const append = await repo.appendTurn(
        actor.userId,
        sessionId,
        { ...hasil.data, at: now() },
        batas,
      );
      if (append.ok) return append.turn;
      switch (append.sebab) {
        case "tidak-ada":
          throw appError("AI_SESI_TIDAK_DITEMUKAN");
        case "diproses":
          throw appError("AI_SESI_SEDANG_DIFINALISASI");
        case "selesai":
          throw appError("AI_SESI_SUDAH_SELESAI");
        case "penuh":
          throw appError("AI_TRANSKRIP_PENUH");
      }
    },

    async semuaUntukEkspor(userId) {
      return (await repo.listForExport(userId)).map(keSesi);
    },
  };
}
