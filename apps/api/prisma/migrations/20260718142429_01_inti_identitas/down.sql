-- Down migration 01_inti_identitas (konvensi: down.sql manual per migrasi,
-- diuji up→down→up; lihat prisma/README.md). Urutan: anak dulu, baru induk.
DROP TABLE IF EXISTS "audit_logs";
DROP TABLE IF EXISTS "accessibility_profiles";
DROP TABLE IF EXISTS "refresh_tokens";
DROP TABLE IF EXISTS "users";
DROP TYPE IF EXISTS "Role";
