-- Kebalikan migrasi 07. Backfill-nya ikut hilang, dan itu tidak merugikan:
-- nilainya diturunkan dari `google_id` yang masih ada di barisnya, jadi bisa
-- dihitung ulang bila migrasi ini dinaikkan lagi.
--
-- Konsekuensi: langkah 2 `findOrCreateByGoogle` kehilangan syarat "alamatnya
-- terbukti milik pemiliknya", sehingga alamat yang diketik sendiri lewat
-- PUT /me bisa kembali dipakai menautkan identitas Google. Turunkan HANYA
-- bersama rollback kode PR-020a.
ALTER TABLE "users" DROP COLUMN "email_verified";
