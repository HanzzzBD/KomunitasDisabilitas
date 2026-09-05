-- Kebalikan migrasi 12: kembali ke DEFAULT waktu-transaksi.
--
-- Konsekuensi: bila kode juga dikembalikan ke `@default(now())`, urutan
-- "terbaru dulu" kembali bersandar pada stempel ber-presisi milidetik dari
-- klien, dan baris yang ditambahkan beruntun bisa tampil dengan urutan salah.
ALTER TABLE "skills" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "experiences" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "educations" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
