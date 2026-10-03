-- Rollback migrasi 21. Membuang status penangguhan: akun yang sedang
-- ditangguhkan MENJADI AKTIF kembali. Jejak siapa/kapan/mengapa tetap ada di
-- audit_logs (USER_SUSPENDED / USER_UNSUSPENDED).
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_suspend_berpasangan";
ALTER TABLE "users" DROP COLUMN IF EXISTS "suspend_reason";
ALTER TABLE "users" DROP COLUMN IF EXISTS "suspended_at";
