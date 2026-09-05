-- Kebalikan migrasi 08.
--
-- `ai_usage_monthly` adalah AGREGAT yang sengaja hidup lebih lama daripada
-- baris mentahnya (PR-024). Menurunkannya MENGHAPUS DATA yang tidak bisa
-- dihitung ulang setelah `ai_usage` mentahnya kedaluwarsa. Ekspor tabel ini
-- lebih dulu bila angkanya masih dibutuhkan.
DROP TABLE "ai_usage_monthly";
DROP INDEX "refresh_tokens_expires_at_brin";
DROP INDEX "refresh_tokens_revoked_at_brin";
