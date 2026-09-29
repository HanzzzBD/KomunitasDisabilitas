-- Kebalikan migrasi 17.
--
-- PostgreSQL TIDAK punya `ALTER TYPE ... DROP VALUE`. Satu-satunya jalan adalah
-- membuat ulang tipenya: sesi `finalizing` dikembalikan ke `active` lebih dulu
-- (ekstraksinya dianggap tidak pernah dimulai; worker yang masih memegang job-nya
-- menemukan sesi `active` dan berhenti tanpa menulis apa pun).
-- Jalankan down.sql migrasi 18 LEBIH DULU — indeks parsialnya menyebut nilai ini.
--
-- CHECK `finalized_konsisten` dan indeks `satu_aktif` menyebut literal bertipe
-- enum LAMA, jadi keduanya dilepas sebelum kolom diubah tipenya dan dipasang
-- lagi sesudahnya — tanpa itu `ALTER COLUMN ... TYPE` gagal ("operator does not
-- exist"). Ditemukan oleh `ai-cv-finalize-db.test.ts`, bukan oleh pembacaan.
UPDATE "ai_chat_sessions" SET "status" = 'active' WHERE "status"::text = 'finalizing';
DROP INDEX IF EXISTS "ai_chat_sessions_satu_aktif";
ALTER TABLE "ai_chat_sessions" DROP CONSTRAINT IF EXISTS "ai_chat_sessions_finalized_konsisten";
ALTER TYPE "AiChatSessionStatus" RENAME TO "AiChatSessionStatus_lama";
CREATE TYPE "AiChatSessionStatus" AS ENUM ('active', 'finalized');
ALTER TABLE "ai_chat_sessions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ai_chat_sessions" ALTER COLUMN "status" TYPE "AiChatSessionStatus"
  USING "status"::text::"AiChatSessionStatus";
ALTER TABLE "ai_chat_sessions" ALTER COLUMN "status" SET DEFAULT 'active';
DROP TYPE "AiChatSessionStatus_lama";
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_finalized_konsisten" CHECK (
  ("status" = 'finalized') = ("finalized_at" IS NOT NULL)
);
CREATE UNIQUE INDEX "ai_chat_sessions_satu_aktif" ON "ai_chat_sessions"("user_id")
  WHERE "status" = 'active';
