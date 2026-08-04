-- Migrasi 05 (PR-018c): sebab pencabutan refresh token (SDD §8.1, §6.4).
--
-- Dua hal bergantung pada kolom ini:
--
-- 1. REUSE DETECTION yang jujur. Sebelumnya setiap baris tercabut yang dipakai
--    lagi dianggap reuse. Setelah logout ada, klien basi yang mencoba refresh
--    akan menyalakan AUTH_REFRESH_REUSED palsu — persis pada sinyal keamanan
--    yang paling tidak boleh berisik. Hanya 'rotated' yang layak dicurigai.
--
-- 2. RETENSI BERJENJANG (PR-024): baris 'reuse' adalah bukti insiden dan
--    disimpan 2 tahun, jauh lebih lama daripada rotasi biasa (180 hari).
--
-- ADITIF & backward-compatible satu versi: kolom NULLABLE, jadi baris lama
-- (dicabut sebelum kolom ini ada) tetap sah dan kode versi sebelumnya — yang
-- tidak tahu kolom ini — tetap bisa menulis baris refresh_tokens.
-- Rollback = DROP COLUMN lalu DROP TYPE.
CREATE TYPE "RefreshRevokedReason" AS ENUM (
  'rotated',
  'logout',
  'logout_all',
  'reuse',
  'account_deleted'
);

ALTER TABLE "refresh_tokens" ADD COLUMN "revoked_reason" "RefreshRevokedReason";
