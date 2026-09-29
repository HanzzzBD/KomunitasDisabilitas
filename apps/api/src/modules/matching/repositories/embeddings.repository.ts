// modules/matching — penulisan vektor embedding + invalidasi `match_scores` (PR-069).
//
// Kolom `profile_embedding`/`job_embedding` bertipe `vector(768)` yang tidak
// dikenal Prisma Client (`Unsupported`), jadi penulisannya raw SQL — dan skema
// menetapkan pemiliknya: HANYA repo matching (catatan `schema.prisma`, PR-010).
// Seluruh nilai lewat parameter `Prisma.sql`; vektor dikirim sebagai literal
// teks `[a,b,…]` yang di-cast `::vector` oleh PostgreSQL, bukan disambung ke
// string SQL.
//
// VEKTOR + INVALIDASI DALAM SATU TRANSAKSI. Skor yang dihitung dari vektor lama
// tidak boleh selamat dari penggantian vektornya: tanpa transaksi, permintaan
// feed yang menyelinap di antara dua pernyataan bisa menyimpan skor basi yang
// lalu hidup 24 jam di cache (PR-072).
import { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";

/**
 * Dimensi kolom `vector(768)` di `schema.prisma`. Ditulis ulang, bukan diimpor
 * dari `core/ai`: yang dijaga di sini adalah KOLOMNYA, dan repository memang
 * tidak boleh bergantung pada gateway AI (boundaries PR-002). Kesamaannya
 * dengan `AI_EMBED_DIMENSIONS` dijaga test.
 */
export const DIMENSI_KOLOM_VEKTOR = 768;

/**
 * Literal pgvector dari larik angka. Panjang dan keterhinggaan diperiksa di
 * sini meski adapter sudah memeriksanya: repository ini penjaga terakhir kolom
 * `vector(768)`, dan `NaN` yang lolos ke sana merusak setiap perbandingan
 * kosinus yang menyentuh baris itu tanpa satu pun error.
 */
function literalVektor(vektor: readonly number[]): string {
  if (vektor.length !== DIMENSI_KOLOM_VEKTOR || !vektor.every((v) => Number.isFinite(v))) {
    throw new Error(`Vektor embedding tidak sah (panjang ${vektor.length})`);
  }
  return `[${vektor.join(",")}]`;
}

export interface EmbeddingsRepository {
  /**
   * Tulis vektor profil (atau `null` untuk mengosongkannya) DAN hapus seluruh
   * `match_scores` pengguna itu, atomik. `false` = profilnya tidak ada.
   */
  simpanVektorProfil(userId: string, vektor: readonly number[] | null): Promise<boolean>;
  /** Sama, untuk lowongan; skor yang dihapus adalah milik lowongan itu. */
  simpanVektorLowongan(jobId: string, vektor: readonly number[] | null): Promise<boolean>;
  /** Invalidasi saja — dipanggil SEBELUM embedding, lihat embedding.service. */
  hapusSkorPengguna(userId: string): Promise<number>;
  hapusSkorLowongan(jobId: string): Promise<number>;
}

export function createEmbeddingsRepository(prisma: AppPrisma): EmbeddingsRepository {
  const nilai = (vektor: readonly number[] | null) =>
    vektor === null ? Prisma.sql`NULL` : Prisma.sql`${literalVektor(vektor)}::vector`;

  return {
    async simpanVektorProfil(userId, vektor) {
      const [diubah] = await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE "seeker_profiles"
          SET "profile_embedding" = ${nilai(vektor)}
          WHERE "user_id" = ${userId}::uuid`,
        prisma.matchScore.deleteMany({ where: { userId } }),
      ]);
      return diubah > 0;
    },

    async simpanVektorLowongan(jobId, vektor) {
      const [diubah] = await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE "jobs"
          SET "job_embedding" = ${nilai(vektor)}
          WHERE "id" = ${jobId}::uuid`,
        prisma.matchScore.deleteMany({ where: { jobId } }),
      ]);
      return diubah > 0;
    },

    async hapusSkorPengguna(userId) {
      const { count } = await prisma.matchScore.deleteMany({ where: { userId } });
      return count;
    },

    async hapusSkorLowongan(jobId) {
      const { count } = await prisma.matchScore.deleteMany({ where: { jobId } });
      return count;
    },
  };
}
