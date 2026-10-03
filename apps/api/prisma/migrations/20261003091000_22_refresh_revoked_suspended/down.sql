-- Rollback migrasi 22. PostgreSQL tidak bisa membuang nilai enum secara
-- langsung; baris ber-`suspended` dipetakan ke `logout_all` lalu tipe dibangun
-- ulang tanpa nilai itu.
UPDATE "refresh_tokens" SET "revoked_reason" = 'logout_all' WHERE "revoked_reason" = 'suspended';
ALTER TYPE "RefreshRevokedReason" RENAME TO "RefreshRevokedReason_lama";
CREATE TYPE "RefreshRevokedReason" AS ENUM ('rotated', 'logout', 'logout_all', 'reuse', 'account_deleted');
ALTER TABLE "refresh_tokens"
  ALTER COLUMN "revoked_reason" TYPE "RefreshRevokedReason"
  USING "revoked_reason"::text::"RefreshRevokedReason";
DROP TYPE "RefreshRevokedReason_lama";
