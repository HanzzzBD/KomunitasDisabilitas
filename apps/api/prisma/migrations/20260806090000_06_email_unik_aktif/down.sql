-- Kebalikan migrasi 06.
--
-- BACA SEBELUM MENJALANKAN. Index ini adalah wasit tingkat DB yang menutup
-- penautan akun lewat email (lihat migrasi 06 dan koreksinya di migrasi 07).
-- Pemeriksaan di lapisan aplikasi TIDAK setara: ia baca-lalu-tulis, dan dua
-- permintaan bersamaan sama-sama lolos. Menurunkan ini membuka kembali balapan
-- itu, jadi ia hanya boleh dijalankan bersama rollback kode PR-020.
DROP INDEX "users_email_aktif_key";
