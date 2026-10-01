-- Turun migrasi 20: buang snapshot pengungkapan. YANG HILANG ADALAH DATA:
-- salinan yang diungkap pada lamaran ber-disclose tidak bisa dibuat ulang
-- (profil mungkin sudah berubah). Jalankan hanya bila rollback memang perlu.
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "applications_snapshot_hanya_bila_disclose";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "disclosure_snapshot";
