-- Migrasi 14 — tabel `devices` untuk push notification (PR-048a, SDD §6.2 G7).
--
-- DITULIS TANGAN, DAN ITU BUKAN PREFERENSI GAYA. `prisma migrate dev` untuk
-- perubahan ini menghasilkan TUJUH pernyataan `DROP INDEX` yang tidak diminta
-- siapa pun:
--
--   applications_job_status, applications_user_updated, jobs_accommodations_gin,
--   jobs_embedding_hnsw, jobs_status_published_at, jobs_title_trgm,
--   seeker_profiles_embedding_hnsw
--
-- Ketujuhnya dibuat lewat raw SQL di migrasi 03 dan TIDAK terwakili di
-- schema.prisma, sehingga Prisma membacanya sebagai drift dan "merapikannya".
-- Menjalankan berkas generate-an itu apa adanya akan menghapus indeks HNSW
-- pgvector dan trigram — pencarian lowongan dan job matching berubah menjadi
-- seq scan, tanpa satu pun error yang memberitahu.
--
-- Perangkapnya sudah menggigit sekali (2026-09-05, di DB dev saat menyiapkan
-- PR ini). Dicatat sebagai utang U-15 di docs/utang-teknis.md — perbaikan
-- sesungguhnya adalah mendeklarasikan indeks yang REPRESENTABLE di
-- schema.prisma, dan itu migrasi tersendiri.
--
-- ATURAN SEMENTARA: setiap migrasi baru WAJIB dibaca baris per baris sebelum
-- di-commit, dan setiap `DROP INDEX` yang tidak Anda minta sendiri adalah
-- tanda perangkap ini, bukan pembersihan.

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('android', 'ios', 'web');

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- Token unik GLOBAL, bukan per pengguna. Perangkat yang berpindah akun
-- mengirim token yang sama; unik global membuat pendaftaran berikutnya
-- MEMINDAHKAN kepemilikan barisnya alih-alih menggandakannya — tanpa itu
-- pemilik lama terus menerima notifikasi pemilik baru.
CREATE UNIQUE INDEX "devices_fcm_token_key" ON "devices"("fcm_token");

-- Pengiriman push selalu bertanya "perangkat apa saja milik pengguna ini".
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
