-- Kebalikan migrasi 05. Urutannya WAJIB kolom dulu, baru tipe: enum yang masih
-- dirujuk kolom tidak bisa di-DROP.
--
-- Konsekuensi: sebab pencabutan hilang, jadi reuse detection kembali menganggap
-- SETIAP baris tercabut yang dipakai lagi sebagai reuse — termasuk klien basi
-- sesudah logout. Alarm palsu pada sinyal keamanan, persis yang migrasi ini
-- perbaiki. Baris 'reuse' yang disimpan 2 tahun untuk bukti insiden (PR-024)
-- juga kehilangan penandanya.
ALTER TABLE "refresh_tokens" DROP COLUMN "revoked_reason";
DROP TYPE "RefreshRevokedReason";
