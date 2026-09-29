-- Kebalikan migrasi 16.
--
-- Menurunkannya menghapus SELURUH transkrip AI CV Builder. Percakapan yang
-- sedang berjalan hilang dan pengguna harus memulai ulang; CV yang SUDAH
-- diekstrak (tabel `resumes`) tidak tersentuh. Diuji terhadap PostgreSQL
-- sungguhan di `ai-chat-sessions-db.test.ts`.
DROP TABLE IF EXISTS "ai_chat_sessions";
DROP TYPE IF EXISTS "AiChatSessionStatus";
