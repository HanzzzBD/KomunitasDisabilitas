-- Kebalikan migrasi 13.
--
-- MENURUNKAN INI MENGEMBALIKAN audit_logs menjadi tabel biasa yang bisa diubah
-- dan dihapus siapa pun yang punya hak menulis. Jangan dijalankan kecuali
-- memang sedang memutar balik migrasi 13 secara sadar.
DROP TRIGGER IF EXISTS audit_logs_append_only_truncate ON "audit_logs";
DROP TRIGGER IF EXISTS audit_logs_append_only_baris ON "audit_logs";
DROP FUNCTION IF EXISTS audit_logs_tolak_ubah();
