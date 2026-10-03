// modules/signbridge — repository (PR-084, SDD §6.2 poin 5).
//
// Konten kamus milik platform, dikurasi admin — tidak ada data pribadi dan
// tidak ada penjaga kepemilikan. `createdBy` hanya jejak kurator.
import { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";
import type { SignVideoStatus } from "@nawasena/schemas";

/** Baris `sign_videos` apa adanya. `category` divalidasi di batas HTTP, bukan DB. */
export interface SignVideoRow {
  id: string;
  phrase: string;
  category: string | null;
  status: SignVideoStatus;
  videoKey: string | null;
  thumbnailKey: string | null;
  captionKey: string | null;
  transcript: string | null;
  durationS: number | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SignVideoCreateData {
  phrase: string;
  category: string;
  transcript: string | null;
  durationS: number | null;
  createdBy: string;
}

/** Patch admin — field yang tidak disebut berarti tidak diubah. */
export interface SignVideoUpdatePatch {
  phrase?: string;
  category?: string;
  transcript?: string | null;
  durationS?: number | null;
  videoKey?: string | null;
  thumbnailKey?: string | null;
  captionKey?: string | null;
}

export interface SignVideoSearchFilter {
  query?: string;
  category?: string;
  limit: number;
}

const KOLOM = {
  id: true,
  phrase: true,
  category: true,
  status: true,
  videoKey: true,
  thumbnailKey: true,
  captionKey: true,
  transcript: true,
  durationS: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** `%`, `_`, `\` di kata kunci adalah huruf biasa, bukan wildcard ILIKE. */
function escapeLike(teks: string): string {
  return teks.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function createSignVideosRepository(prisma: AppPrisma) {
  return {
    findById: (id: string): Promise<SignVideoRow | null> =>
      prisma.signVideo.findUnique({ where: { id }, select: KOLOM }),

    /** Seluruh entri (draft + published), terbaru dulu — tanpa pagination (skala pilot). */
    listAll: (): Promise<SignVideoRow[]> =>
      prisma.signVideo.findMany({
        select: KOLOM,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),

    create: (id: string, data: SignVideoCreateData): Promise<SignVideoRow> =>
      prisma.signVideo.create({ data: { id, ...data }, select: KOLOM }),

    async update(id: string, patch: SignVideoUpdatePatch): Promise<SignVideoRow | null> {
      const { count } = await prisma.signVideo.updateMany({ where: { id }, data: patch });
      if (count === 0) return null;
      return prisma.signVideo.findUnique({ where: { id }, select: KOLOM });
    },

    /**
     * draft → published secara atomik. `null` = tidak ada baris draft dengan
     * id itu (tidak ada, atau sudah diterbitkan admin lain di antara dua klik).
     * Kelengkapan media dijaga service (422) DAN CHECK `sign_videos_terbit_lengkap`.
     */
    async publish(id: string): Promise<SignVideoRow | null> {
      const { count } = await prisma.signVideo.updateMany({
        where: { id, status: "draft" },
        data: { status: "published" },
      });
      if (count === 0) return null;
      return prisma.signVideo.findUnique({ where: { id }, select: KOLOM });
    },

    /** published → draft secara atomik (PR-085). `null` = tidak ada baris published. */
    async unpublish(id: string): Promise<SignVideoRow | null> {
      const { count } = await prisma.signVideo.updateMany({
        where: { id, status: "published" },
        data: { status: "draft" },
      });
      if (count === 0) return null;
      return prisma.signVideo.findUnique({ where: { id }, select: KOLOM });
    },

    /**
     * Pencarian publik — HANYA published. Raw SQL karena FTS tidak punya API
     * Prisma. Ekspresi `to_tsvector('indonesian', "phrase")` HARUS sama persis
     * dengan indeks `sign_videos_phrase_fts` (migrasi 03) supaya indeksnya dipakai.
     *
     * ILIKE melengkapi FTS untuk ketikan yang belum menjadi kata utuh ("teri"
     * → "terima kasih"): stemmer tidak menolong di sana. Kamus berukuran
     * ratusan baris, jadi pemindaian ILIKE tidak berarti.
     */
    async search(filter: SignVideoSearchFilter): Promise<SignVideoRow[]> {
      const kondisi: Prisma.Sql[] = [Prisma.sql`v."status" = 'published'`];
      if (filter.category !== undefined) {
        kondisi.push(Prisma.sql`v."category" = ${filter.category}`);
      }
      let urutan = Prisma.sql`lower(v."phrase") ASC, v."id" ASC`;
      if (filter.query !== undefined) {
        const pola = `%${escapeLike(filter.query)}%`;
        kondisi.push(Prisma.sql`(
          to_tsvector('indonesian', v."phrase") @@ plainto_tsquery('indonesian', ${filter.query})
          OR v."phrase" ILIKE ${pola}
        )`);
        urutan = Prisma.sql`ts_rank(to_tsvector('indonesian', v."phrase"), plainto_tsquery('indonesian', ${filter.query})) DESC, ${urutan}`;
      }

      return prisma.$queryRaw<SignVideoRow[]>`
        SELECT
          v."id", v."phrase", v."category", v."status"::text AS "status",
          v."video_key" AS "videoKey", v."thumbnail_key" AS "thumbnailKey",
          v."caption_key" AS "captionKey", v."transcript",
          v."duration_s" AS "durationS", v."created_by" AS "createdBy",
          v."created_at" AS "createdAt", v."updated_at" AS "updatedAt"
        FROM "sign_videos" v
        WHERE ${Prisma.join(kondisi, " AND ")}
        ORDER BY ${urutan}
        LIMIT ${filter.limit}
      `;
    },
  };
}

export type SignVideosRepository = ReturnType<typeof createSignVideosRepository>;
