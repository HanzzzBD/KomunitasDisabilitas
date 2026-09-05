-- Kebalikan migrasi 11. Aman dijalankan: kolomnya aditif dan tidak dirujuk FK
-- maupun index. Kode versi sebelumnya mengurutkan dengan `id desc` dan tetap
-- jalan tanpa kolom ini.
ALTER TABLE "skills" DROP COLUMN "created_at";
ALTER TABLE "experiences" DROP COLUMN "created_at";
ALTER TABLE "educations" DROP COLUMN "created_at";
