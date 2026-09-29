// modules/ai — repository sesi AI CV Builder (PR-065, SDD §6.4, risiko T7).
//
// SETIAP QUERY MENYEBUT `userId`, termasuk yang sudah punya `id` — aturan yang
// sama dengan `resumes.repository.ts`, dan alasannya juga sama: jalur yang lupa
// memeriksa kepemilikan TIDAK BISA DITULIS. Sesi milik orang lain berperilaku
// persis seperti sesi yang tidak ada.
//
// APPEND ADALAH SATU `UPDATE`, BUKAN BACA-UBAH-TULIS. Transkrip jsonb yang
// dibaca ke JavaScript, ditambah satu giliran, lalu ditulis ulang akan kehilangan
// giliran setiap kali dua permintaan bertemu: keduanya membaca larik yang sama,
// dan yang menulis belakangan menimpa yang pertama. Di sini penambahan dan
// penomorannya terjadi DI DALAM PostgreSQL pada baris yang terkunci `UPDATE`:
// permintaan kedua menunggu, lalu (READ COMMITTED) mengevaluasi ulang ekspresi
// `SET` dan `WHERE`-nya terhadap versi baris yang sudah memuat giliran pertama.
// Hasilnya `seq` yang tidak pernah ganda dan tidak pernah bolong — dibuktikan
// terhadap PostgreSQL sungguhan di `ai-chat-sessions-db.test.ts`.
//
// Batas ukuran ditegakkan di `WHERE` yang SAMA, bukan diperiksa lebih dulu:
// pemeriksaan terpisah bisa dilewati dua permintaan serentak yang sama-sama
// melihat sisa satu tempat.
import type { AiChatRole, AiChatSessionStatus, AiChatTurn } from "@nawasena/schemas";
import type { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";

export interface ChatSessionRow {
  id: string;
  status: AiChatSessionStatus;
  /** Urut `seq`, tanpa lubang — hanya `appendTurn` yang menulis kolom ini. */
  transcript: AiChatTurn[];
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
  /** Draft CV hasil ekstraksi (PR-067). */
  resumeId: string | null;
  /** Ekstraksi terakhir gagal — kapan & kode sebabnya (PR-067). */
  extractionFailedAt: Date | null;
  extractionError: string | null;
}

/** Giliran yang hendak ditambahkan. `seq` TIDAK di sini — database yang memberinya. */
export interface GiliranTulis {
  role: AiChatRole;
  content: string;
  at: Date;
}

export interface BatasTranskrip {
  maxTurns: number;
  maxTranscriptBytes: number;
}

/**
 * Hasil append. Tiga penolakan dibedakan karena jawabannya bagi pengguna
 * berbeda — tetapi repository tidak menentukan status HTTP-nya (service).
 */
export type HasilAppend =
  | { ok: true; turn: AiChatTurn }
  | { ok: false; sebab: "tidak-ada" | "diproses" | "selesai" | "penuh" };

/**
 * Hasil memulai finalize (PR-067). `diproses` = sudah `finalizing` (finalize
 * ganda); `selesai` = sudah `finalized`. Keduanya BUKAN kegagalan bagi
 * pemanggil — idempotensi finalize dibangun di atas pembedaan ini.
 */
export type HasilMulaiFinalisasi = "ok" | "tidak-ada" | "diproses" | "selesai";

/** Dua kategori retensi, predikatnya SALING LEPAS (berdasarkan `status`). */
export type KategoriRetensiChat = "finalized" | "abandoned";

export interface ChatSessionsRepository {
  /** null bila tidak ada ATAU milik orang lain. */
  findOwned(userId: string, id: string): Promise<ChatSessionRow | null>;
  /**
   * Sesi TERBUKA (`active` ATAU `finalizing`) milik pengguna ini — paling banyak
   * satu (unique parsial `ai_chat_sessions_satu_terbuka`). Nama lamanya
   * dipertahankan: bagi pemanggil, sesi yang sedang difinalisasi tetap "sesi
   * yang sedang berjalan" dan tidak boleh ditimpa sesi baru.
   */
  findActive(userId: string): Promise<ChatSessionRow | null>;
  /**
   * Buat sesi aktif dengan `id`, ATAU kembalikan sesi aktif yang sudah ada.
   * `baru` false berarti `id` tidak dipakai.
   */
  createOrGetActive(
    userId: string,
    id: string,
    now: Date,
  ): Promise<{ row: ChatSessionRow; baru: boolean }>;
  appendTurn(
    userId: string,
    id: string,
    giliran: GiliranTulis,
    batas: BatasTranskrip,
  ): Promise<HasilAppend>;
  /** Seluruh sesi milik pengguna, terlama dulu — untuk ekspor PDP. */
  listForExport(userId: string): Promise<ChatSessionRow[]>;
  /**
   * `active → finalizing` (PR-067), sekaligus menghapus jejak gagal sebelumnya.
   * Satu `UPDATE` bersyarat: dua finalize serentak, hanya satu yang `ok`.
   */
  mulaiFinalisasi(userId: string, id: string, now: Date): Promise<HasilMulaiFinalisasi>;
  /** `finalizing → active` TANPA jejak gagal — enqueue gagal, finalize tak pernah dimulai. */
  batalFinalisasi(userId: string, id: string, now: Date): Promise<boolean>;
  /** `finalizing → finalized` + tautan draft. false = sesi tidak lagi `finalizing`. */
  selesaiFinalisasi(userId: string, id: string, resumeId: string, now: Date): Promise<boolean>;
  /** `finalizing → active` + jejak gagal (kode saja). false = sesi tidak lagi `finalizing`. */
  gagalFinalisasi(userId: string, id: string, kode: string, now: Date): Promise<boolean>;
  countRetention(kategori: KategoriRetensiChat, cutoff: Date): Promise<number>;
  deleteRetentionBatch(kategori: KategoriRetensiChat, cutoff: Date, batas: number): Promise<number>;
}

const KOLOM = {
  id: true,
  status: true,
  transcript: true,
  createdAt: true,
  updatedAt: true,
  finalizedAt: true,
  resumeId: true,
  extractionFailedAt: true,
  extractionError: true,
} as const;

/** Kolom `transcript` bertipe `JsonValue`; isinya hanya pernah ditulis `appendTurn`. */
function keRow(
  baris: Omit<ChatSessionRow, "transcript"> & { transcript: unknown },
): ChatSessionRow {
  return { ...baris, transcript: baris.transcript as AiChatTurn[] };
}

/**
 * Perkiraan byte yang ditambahkan satu giliran ke bentuk teks jsonb.
 *
 * Perkiraan, bukan hitungan persis: `jsonb::text` menyisipkan spasi setelah
 * `:` dan `,`, jadi angka ini sedikit di BAWAH kenyataan — ditambah kelonggaran
 * per field supaya batasnya tidak bisa dilampaui lebih dari beberapa byte.
 */
function perkiraanByte(g: GiliranTulis, seq: number): number {
  const json = JSON.stringify({ seq, role: g.role, content: g.content, at: g.at.toISOString() });
  return Buffer.byteLength(json, "utf8") + 16;
}

export function createChatSessionsRepository(prisma: AppPrisma): ChatSessionsRepository {
  async function findActive(userId: string): Promise<ChatSessionRow | null> {
    const baris = await prisma.aiChatSession.findFirst({
      where: { userId, status: { in: ["active", "finalizing"] } },
      select: KOLOM,
    });
    return baris === null ? null : keRow(baris);
  }

  /** Transisi bersyarat `dari → ke`; true = baris ini yang berpindah. */
  async function pindah(
    userId: string,
    id: string,
    dari: AiChatSessionStatus,
    data: Prisma.AiChatSessionUpdateManyMutationInput,
  ): Promise<boolean> {
    const { count } = await prisma.aiChatSession.updateMany({
      where: { id, userId, status: dari },
      data,
    });
    return count === 1;
  }

  return {
    async findOwned(userId, id) {
      const baris = await prisma.aiChatSession.findFirst({ where: { id, userId }, select: KOLOM });
      return baris === null ? null : keRow(baris);
    },

    findActive,

    /**
     * `ON CONFLICT ... DO NOTHING` terhadap unique PARSIAL
     * `ai_chat_sessions_satu_terbuka` — bukan `findActive` lalu `create`.
     * Predikat `ON CONFLICT` WAJIB sama persis dengan predikat indeksnya;
     * PostgreSQL menolak indeks yang tidak cocok sebagai target konflik.
     *
     * Dua "mulai percakapan" yang tiba bersamaan (klik ganda, retry 3G) akan
     * sama-sama tidak menemukan sesi aktif lalu sama-sama membuat satu. Di
     * sini yang kedua bertabrakan dengan indeks dan diam-diam tidak menulis
     * apa pun; keduanya lalu membaca sesi yang SAMA.
     *
     * Lingkaran kecil untuk satu kasus sempit: sesi aktif yang membuat INSERT
     * kita mundur bisa saja difinalisasi sebelum kita sempat membacanya. Tiga
     * putaran jauh melebihi yang dibutuhkan; melewatinya berarti ada yang
     * benar-benar rusak, dan itu dilempar, bukan disembunyikan.
     */
    async createOrGetActive(userId, id, now) {
      for (let putaran = 0; putaran < 3; putaran += 1) {
        const dibuat = await prisma.$queryRaw<Array<{ id: string }>>`
          INSERT INTO "ai_chat_sessions" ("id", "user_id", "updated_at")
          VALUES (${id}::uuid, ${userId}::uuid, ${now})
          ON CONFLICT ("user_id") WHERE "status" IN ('active', 'finalizing') DO NOTHING
          RETURNING "id"`;
        const row = await findActive(userId);
        if (row !== null) return { row, baru: dibuat.length > 0 };
      }
      throw new Error("Sesi aktif tidak bisa dibuat maupun dibaca");
    },

    async appendTurn(userId, id, giliran, batas) {
      // `seq` yang dipakai untuk memperkirakan byte tidak harus tepat — digitnya
      // saja yang berpengaruh, dan batas giliran menjaganya tetap kecil.
      const tambahan = perkiraanByte(giliran, batas.maxTurns);
      const hasil = await prisma.$queryRaw<Array<{ seq: number }>>`
        UPDATE "ai_chat_sessions"
        SET "transcript" = "transcript" || jsonb_build_array(jsonb_build_object(
              'seq', jsonb_array_length("transcript") + 1,
              'role', ${giliran.role}::text,
              'content', ${giliran.content}::text,
              'at', ${giliran.at.toISOString()}::text
            )),
            "updated_at" = ${giliran.at}
        WHERE "id" = ${id}::uuid
          AND "user_id" = ${userId}::uuid
          AND "status" = 'active'
          AND jsonb_array_length("transcript") < ${batas.maxTurns}
          AND octet_length("transcript"::text) + ${tambahan} <= ${batas.maxTranscriptBytes}
        RETURNING jsonb_array_length("transcript")::int AS "seq"`;

      const [baris] = hasil;
      if (baris !== undefined) {
        return {
          ok: true,
          turn: {
            seq: baris.seq,
            role: giliran.role,
            content: giliran.content,
            at: giliran.at.toISOString(),
          },
        };
      }

      // Tidak ada baris yang berubah — cari tahu SEBABNYA, karena jawabannya
      // bagi pengguna berbeda. Baca terpisah ini aman: ia tidak menulis apa pun,
      // dan keadaan yang ia laporkan hanya bisa bergerak maju (aktif → selesai).
      const sesi = await prisma.aiChatSession.findFirst({
        where: { id, userId },
        select: { status: true },
      });
      if (sesi === null) return { ok: false, sebab: "tidak-ada" };
      if (sesi.status === "finalizing") return { ok: false, sebab: "diproses" };
      if (sesi.status !== "active") return { ok: false, sebab: "selesai" };
      return { ok: false, sebab: "penuh" };
    },

    async mulaiFinalisasi(userId, id, now) {
      const pindahOk = await pindah(userId, id, "active", {
        status: "finalizing",
        updatedAt: now,
        extractionFailedAt: null,
        extractionError: null,
      });
      if (pindahOk) return "ok";
      const sesi = await prisma.aiChatSession.findFirst({
        where: { id, userId },
        select: { status: true },
      });
      if (sesi === null) return "tidak-ada";
      return sesi.status === "finalizing" ? "diproses" : "selesai";
    },

    batalFinalisasi(userId, id, now) {
      return pindah(userId, id, "finalizing", { status: "active", updatedAt: now });
    },

    async selesaiFinalisasi(userId, id, resumeId, now) {
      // `finalized_at` dan `status` di SATU pernyataan — CHECK
      // `ai_chat_sessions_finalized_konsisten` menolak keadaan setengahnya.
      // SQL mentah karena `updateMany` Prisma tidak menerima kolom FK relasi.
      const berubah = await prisma.$executeRaw`
        UPDATE "ai_chat_sessions"
        SET "status" = 'finalized', "finalized_at" = ${now},
            "resume_id" = ${resumeId}::uuid, "updated_at" = ${now}
        WHERE "id" = ${id}::uuid AND "user_id" = ${userId}::uuid AND "status" = 'finalizing'`;
      return berubah === 1;
    },

    gagalFinalisasi(userId, id, kode, now) {
      return pindah(userId, id, "finalizing", {
        status: "active",
        extractionFailedAt: now,
        extractionError: kode,
        updatedAt: now,
      });
    },

    async listForExport(userId) {
      const baris = await prisma.aiChatSession.findMany({
        where: { userId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: KOLOM,
      });
      return baris.map(keRow);
    },

    countRetention(kategori, cutoff) {
      return prisma.aiChatSession.count({
        where:
          kategori === "finalized"
            ? { status: "finalized", finalizedAt: { lt: cutoff } }
            : // `finalizing` ikut: sesi yang ekstraksinya tersangkut (worker mati
              // di tengah job) tidak boleh hidup selamanya.
              { status: { in: ["active", "finalizing"] }, updatedAt: { lt: cutoff } },
      });
    },

    /**
     * DELETE berbatch lewat subquery `LIMIT` — `deleteMany` Prisma tidak punya
     * `take` (pola yang sama dengan retensi `refresh_tokens`).
     *
     * Kategori `abandoned` memilih dari `updated_at`, yang bergerak setiap
     * giliran — jadi sesi yang masih dipakai tidak pernah memenuhi syarat,
     * seberapa pun tuanya ia dibuat.
     *
     * Predikatnya DIULANG di luar subquery, dan itu bukan kelalaian salin-tempel.
     * Subquery tidak dievaluasi ulang saat DELETE menunggu kunci baris; yang
     * dievaluasi ulang (READ COMMITTED) hanya `WHERE` luar, terhadap versi baris
     * TERBARU. Tanpa pengulangan ini, giliran yang masuk tepat saat job berjalan
     * — sesi yang dilanjutkan pada hari ke-30 — tetap ikut terhapus.
     */
    deleteRetentionBatch(kategori, cutoff, batas) {
      return kategori === "finalized"
        ? prisma.$executeRaw`
            DELETE FROM "ai_chat_sessions" WHERE "id" IN (
              SELECT "id" FROM "ai_chat_sessions"
              WHERE "status" = 'finalized' AND "finalized_at" < ${cutoff}
              LIMIT ${batas}
            ) AND "status" = 'finalized' AND "finalized_at" < ${cutoff}`
        : prisma.$executeRaw`
            DELETE FROM "ai_chat_sessions" WHERE "id" IN (
              SELECT "id" FROM "ai_chat_sessions"
              WHERE "status" IN ('active', 'finalizing') AND "updated_at" < ${cutoff}
              LIMIT ${batas}
            ) AND "status" IN ('active', 'finalizing') AND "updated_at" < ${cutoff}`;
    },
  };
}
