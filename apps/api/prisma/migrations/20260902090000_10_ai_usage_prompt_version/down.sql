-- Kebalikan migrasi 10. Aman: kolom nullable dan aditif. Yang hilang hanya
-- kemampuan menautkan baris pemakaian ke versi template yang menghasilkannya.
ALTER TABLE "ai_usage" DROP COLUMN "prompt_version";
