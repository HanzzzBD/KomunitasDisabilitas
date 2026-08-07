-- Migrasi 07 (PR-020a): apakah kepemilikan email sudah DIBUKTIKAN.
--
-- KOREKSI ATAS KLAIM MIGRASI 06. Komentar di migrasi 06 menyatakan index unik
-- parsial menutup jalur penautan akun lewat email. Itu TERLALU JAUH, dan
-- kekeliruannya penting: index hanya mencegah DUA baris memegang alamat yang
-- sama — ia melindungi akun yang SUDAH ADA. Ia sama sekali tidak mencegah
-- seseorang mengklaim lebih dulu alamat yang BELUM terdaftar, dan justru itulah
-- serangannya:
--
--   Penyerang menyetel `email: korban@gmail.com` di akunnya sendiri lewat
--   PUT /me. Korban belum punya akun. Saat korban login Google pertama kali,
--   findOrCreateByGoogle langkah 2 mencocokkan email, menemukan baris
--   PENYERANG, dan menautkan google_id korban ke sana. Korban masuk ke akun
--   yang dikendalikan orang lain.
--
-- File migrasi 06 TIDAK diubah: Prisma menyimpan checksum tiap migrasi yang
-- sudah di-apply, jadi menyunting isinya — bahkan komentarnya — akan membuat
-- `migrate deploy` menolak berjalan. Koreksinya hidup di sini dan di dokumen.
--
-- YANG DITUTUP KOLOM INI: langkah 2 hanya boleh mencocokkan baris yang alamatnya
-- terbukti milik pemiliknya. Alamat dari Google ber-`email_verified: true`
-- terbukti; alamat yang diketik sendiri di PUT /me tidak, dan karena itu tidak
-- pernah bisa dipakai menautkan identitas Google siapa pun.
--
-- BACKFILL. Sebelum PR-020 tidak ada cara mengisi email selain lewat login
-- Google, jadi setiap alamat yang ada hari ini datang dari identitas Google yang
-- sudah terverifikasi. Backfill dipersempit ke baris yang MASIH memegang
-- google_id-nya: itu bukti yang melekat pada barisnya sendiri, bukan kesimpulan
-- dari sejarah. Baris ber-email tanpa google_id (hanya mungkin lewat PUT /me
-- setelah PR-020) sengaja dibiarkan false.
--
-- ADITIF & backward-compatible satu versi: NOT NULL DEFAULT false, jadi baris
-- lama terisi sendiri dan kode versi sebelumnya (yang tidak tahu kolom ini)
-- tetap bisa menulis baris users. Rollback = DROP COLUMN.
ALTER TABLE "users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users"
SET "email_verified" = true
WHERE "email" IS NOT NULL AND "google_id" IS NOT NULL;
