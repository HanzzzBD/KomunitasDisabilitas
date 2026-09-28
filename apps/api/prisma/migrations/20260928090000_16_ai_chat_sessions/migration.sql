-- Migrasi 16 — tabel `ai_chat_sessions` untuk AI CV Builder (PR-065, SDD §6.4).
--
-- DITULIS TANGAN, alasannya sama dengan migrasi 14 dan 15 (utang U-15):
-- `prisma migrate dev` mengarang `DROP INDEX` atas indeks raw-SQL migrasi 03.
-- Ditinjau baris per baris; ADITIF saja, tanpa `DROP` apa pun.

-- CreateEnum
CREATE TYPE "AiChatSessionStatus" AS ENUM ('active', 'finalized');

-- CreateTable
CREATE TABLE "ai_chat_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "status" "AiChatSessionStatus" NOT NULL DEFAULT 'active',
    "finalized_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id"),
    -- Append memakai `jsonb_array_length` dan operator `||` larik; transkrip yang
    -- berupa objek akan membuat keduanya berperilaku lain tanpa error yang jelas.
    CONSTRAINT "ai_chat_sessions_transcript_larik" CHECK (jsonb_typeof("transcript") = 'array'),
    -- `finalized_at` ada TEPAT saat status `finalized`. Retensi memilih baris
    -- dari kolom ini; baris `finalized` tanpa stempel waktu tidak akan pernah
    -- terhapus, dan baris `active` berstempel akan terhapus terlalu cepat.
    CONSTRAINT "ai_chat_sessions_finalized_konsisten" CHECK (
      ("status" = 'finalized') = ("finalized_at" IS NOT NULL)
    )
);

CREATE INDEX "ai_chat_sessions_user_id_idx" ON "ai_chat_sessions"("user_id");

-- PALING BANYAK SATU SESI AKTIF PER PENGGUNA (unique parsial; Prisma tidak bisa
-- menyatakannya — karena itu ia juga terdaftar di penjaga raw-SQL
-- `migrasi-skema.test.ts`). "Mulai percakapan" yang terkirim dua kali lewat
-- koneksi 3G bertemu di sini: `INSERT ... ON CONFLICT DO NOTHING` membuat yang
-- kedua MENGAMBIL sesi yang sama alih-alih melahirkan sesi yatim.
CREATE UNIQUE INDEX "ai_chat_sessions_satu_aktif" ON "ai_chat_sessions"("user_id")
  WHERE "status" = 'active';

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
