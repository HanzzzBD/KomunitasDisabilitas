-- Kebalikan migrasi 18. Jalankan SEBELUM down.sql migrasi 17.
--
-- Tautan sesi → draft CV hilang; draft-nya sendiri (tabel `resumes`) tetap ada.
-- Jejak ekstraksi yang gagal ikut hilang — ia hanya penanda UI.
DROP INDEX IF EXISTS "ai_chat_sessions_satu_terbuka";
CREATE UNIQUE INDEX "ai_chat_sessions_satu_aktif" ON "ai_chat_sessions"("user_id")
  WHERE "status" = 'active';
ALTER TABLE "ai_chat_sessions" DROP CONSTRAINT IF EXISTS "ai_chat_sessions_resume_id_fkey";
ALTER TABLE "ai_chat_sessions" DROP COLUMN IF EXISTS "resume_id";
ALTER TABLE "ai_chat_sessions" DROP COLUMN IF EXISTS "extraction_failed_at";
ALTER TABLE "ai_chat_sessions" DROP COLUMN IF EXISTS "extraction_error";
