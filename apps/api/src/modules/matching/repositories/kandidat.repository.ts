// modules/matching — query kandidat pgvector + hard filter SQL (PR-070, SDD §7.2 langkah 1–2).
//
// SATU-SATUNYA tempat raw SQL yang MEMBACA kolom vektor untuk pencocokan
// (penulisnya `embeddings.repository.ts`). Seluruh nilai lewat parameter
// `Prisma.sql` — termasuk nama provinsi yang ditulis bebas oleh pengguna dan
// mode kerja yang di-cast ke enum; tidak ada satu pun string yang disambung.
//
// TIGA HAL YANG TIDAK KELIHATAN DARI SQL-NYA:
//
//   1. `hnsw.ef_search` DISETEL per transaksi (`set_config(..., true)` = SET
//      LOCAL). HNSW mengembalikan paling banyak `ef_search` baris; bawaan
//      pgvector 40 akan diam-diam memotong top-50 menjadi 40.
//   2. `hnsw.iterative_scan = relaxed_order` (pgvector ≥ 0.8). Tanpanya, filter
//      WHERE dievaluasi SESUDAH indeks mengembalikan `ef_search` tetangga
//      terdekat: bila sebagian besar tetangga itu tersaring (lowongan provinsi
//      lain), feed menyusut tanpa error. Pemindaian iteratif terus menelusuri
//      indeks sampai LIMIT terpenuhi.
//   3. `relaxed_order` boleh mengembalikan urutan yang sedikit meleset, jadi
//      hasilnya diurutkan ulang di luar CTE `MATERIALIZED` — pola yang
//      dianjurkan dokumentasi pgvector.
//
// Kolom yang dibaca hanya milik lowongan (publik) dan vektor profil. Kolom
// sensitif `seeker_profiles` tidak disebut sama sekali.
import { Prisma } from "@prisma/client";
import { workModeSchema, type AccommodationNeed, type WorkMode } from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";

/** Jumlah kandidat SDD §7.2 ("pgvector cosine top-50"). */
export const JUMLAH_KANDIDAT = 50;

/**
 * Parameter hard filter — dibangun `susunFilterKandidat` dari profil.
 * Bentuknya umum (daftar mode kerja) dengan sengaja: preferensi mode kerja
 * eksplisit kelak cukup mengubah penyusunnya, bukan SQL-nya.
 */
export interface FilterKandidat {
  /** Mode kerja yang boleh muncul sama sekali. Tidak boleh kosong. */
  modeDiizinkan: readonly WorkMode[];
  /** Mode kerja yang TIDAK terikat lokasi (hari ini: remote). */
  modeBebasLokasi: readonly WorkMode[];
  /** Provinsi pengguna; `null` = tanpa filter lokasi. */
  provinsi: string | null;
}

export interface KandidatLowongan {
  jobId: string;
  /** Kemiripan kosinus 1 − jarak, rentang [-1, 1]; vektor ternormalisasi. */
  kemiripan: number;
  workMode: WorkMode;
  city: string | null;
  province: string | null;
  accommodations: AccommodationNeed[];
  publishedAt: Date | null;
}

export interface OpsiKandidat {
  batas: number;
  efSearch: number;
}

export interface KandidatRepository {
  /** `null` = pengguna belum punya vektor profil (atau akunnya terhapus). */
  cariKandidat(
    userId: string,
    filter: FilterKandidat,
    opsi: OpsiKandidat,
  ): Promise<KandidatLowongan[] | null>;
}

interface BarisKandidat {
  id: string;
  jarak: number;
  work_mode: string;
  city: string | null;
  province: string | null;
  accommodations: unknown;
  published_at: Date | null;
}

function daftarMode(mode: readonly WorkMode[]): Prisma.Sql {
  // Divalidasi ulang meski tipenya sudah WorkMode: nilai ini menjadi literal
  // enum di SQL, dan repository adalah penjaga terakhirnya.
  const aman = mode.map((m) => workModeSchema.parse(m));
  return Prisma.join(aman.map((m) => Prisma.sql`${m}::"WorkMode"`));
}

/**
 * Vektor profil sebagai SUBQUERY, bukan literal yang dikirim dari aplikasi.
 *
 * Bukan soal hemat 768 angka per permintaan saja: dengan literal, planner
 * menaksir biaya dari nilai konkret dan pada katalog kecil (±1.000 lowongan)
 * memilih Seq Scan + Sort; dengan subquery (parameter InitPlan) ia memilih
 * indeks HNSW. Terukur di PR-070 — lihat log. Diekspor untuk EXPLAIN di test.
 */
export function vektorProfil(userId: string): Prisma.Sql {
  return Prisma.sql`(SELECT sp."profile_embedding" FROM "seeker_profiles" sp WHERE sp."user_id" = ${userId}::uuid)`;
}

/**
 * SELECT kandidat — SATU sumber SQL untuk repository DAN test EXPLAIN, supaya
 * yang dibuktikan memakai indeks adalah query yang benar-benar berjalan.
 * Operatornya WAJIB `<=>`: indeks dibuat dengan `vector_cosine_ops`, dan `<->`
 * (L2) di sini membuat indeks tak terpakai tanpa satu pun error.
 */
export function sqlKandidat(userId: string, kondisi: Prisma.Sql, batas: number): Prisma.Sql {
  return Prisma.sql`
    SELECT j."id", j."job_embedding" <=> ${vektorProfil(userId)} AS jarak,
           j."work_mode", j."city", j."province", j."accommodations", j."published_at"
    FROM "jobs" j
    WHERE ${kondisi}
    ORDER BY j."job_embedding" <=> ${vektorProfil(userId)}
    LIMIT ${batas}`;
}

/** Kondisi WHERE hard filter — diekspor untuk EXPLAIN di test. */
export function kondisiKandidat(filter: FilterKandidat): Prisma.Sql {
  if (filter.modeDiizinkan.length === 0) {
    throw new Error("FilterKandidat.modeDiizinkan tidak boleh kosong");
  }
  const kondisi = [
    Prisma.sql`j."status" = 'published'`,
    Prisma.sql`(j."expires_at" IS NULL OR j."expires_at" > now())`,
    Prisma.sql`j."job_embedding" IS NOT NULL`,
    Prisma.sql`j."work_mode" IN (${daftarMode(filter.modeDiizinkan)})`,
  ];
  if (filter.provinsi !== null) {
    // Lowongan tanpa provinsi LOLOS (keputusan owner 2026-09-30): kelalaian
    // data admin tidak boleh diam-diam menghapus lowongan dari feed; PR-071
    // memberinya location_fit rendah. Pembanding case/spasi-insensitif karena
    // kedua sisi ditulis bebas ("Jawa barat" ≠ "Jawa Barat" bukan perbedaan).
    const bebas =
      filter.modeBebasLokasi.length === 0
        ? Prisma.sql`FALSE`
        : Prisma.sql`j."work_mode" IN (${daftarMode(filter.modeBebasLokasi)})`;
    kondisi.push(Prisma.sql`(
      ${bebas}
      OR j."province" IS NULL
      OR lower(btrim(j."province")) = lower(btrim(${filter.provinsi}))
    )`);
  }
  return Prisma.join(kondisi, " AND ");
}

export function createKandidatRepository(prisma: AppPrisma): KandidatRepository {
  return {
    async cariKandidat(userId, filter, opsi) {
      const kondisi = kondisiKandidat(filter);

      return prisma.$transaction(async (tx) => {
        const [profil] = await tx.$queryRaw<Array<{ ada: boolean }>>`
          SELECT sp."profile_embedding" IS NOT NULL AS ada
          FROM "seeker_profiles" sp
          JOIN "users" u ON u."id" = sp."user_id" AND u."deleted_at" IS NULL
          WHERE sp."user_id" = ${userId}::uuid`;
        if (profil?.ada !== true) return null;

        await tx.$queryRaw`SELECT
          set_config('hnsw.ef_search', ${String(opsi.efSearch)}, true),
          set_config('hnsw.iterative_scan', 'relaxed_order', true)`;

        const rows = await tx.$queryRaw<BarisKandidat[]>`
          WITH kandidat AS MATERIALIZED (${sqlKandidat(userId, kondisi, opsi.batas)})
          SELECT "id", "jarak", "work_mode"::text AS work_mode, "city", "province",
                 "accommodations", "published_at"
          FROM kandidat
          ORDER BY "jarak", "id"`;

        return rows.map((r) => ({
          jobId: r.id,
          kemiripan: 1 - Number(r.jarak),
          workMode: r.work_mode as WorkMode,
          city: r.city,
          province: r.province,
          accommodations: Array.isArray(r.accommodations)
            ? (r.accommodations as AccommodationNeed[])
            : [],
          publishedAt: r.published_at,
        }));
      });
    },
  };
}
