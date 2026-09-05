-- Kebalikan migrasi 14.
--
-- Menurunkannya menghapus SELURUH pendaftaran perangkat. Tidak ada data yang
-- tak tergantikan di sini — klien mendaftar ulang tokennya pada peluncuran
-- berikutnya — tetapi sampai itu terjadi, push tidak sampai ke siapa pun.
DROP TABLE IF EXISTS "devices";
DROP TYPE IF EXISTS "DevicePlatform";
