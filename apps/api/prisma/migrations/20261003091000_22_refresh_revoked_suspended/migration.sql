-- Migrasi 22 — alasan pencabutan refresh token `suspended` (PR-083).
--
-- Penangguhan akun mencabut SEMUA refresh token (supaya pemulihan berarti masuk
-- ulang, bukan sesi lama yang hidup lagi). Alasannya dicatat jujur, bukan
-- menumpang `logout_all` — yang itu tindakan pengguna sendiri.
-- Aditif (U-15): nilai enum baru tidak mengubah baris yang ada.
ALTER TYPE "RefreshRevokedReason" ADD VALUE IF NOT EXISTS 'suspended';
