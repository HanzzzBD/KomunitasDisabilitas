-- Down migration 03_domain_marketplace (up→down→up teruji; prisma/README.md).
-- Urutan: anak dulu. Extension vector/pg_trgm TIDAK di-drop (dipakai migrasi lain).
DROP TABLE IF EXISTS "sign_videos";
DROP TABLE IF EXISTS "notifications";
DROP TABLE IF EXISTS "ai_usage";
DROP TABLE IF EXISTS "match_scores";
DROP TABLE IF EXISTS "applications";
DROP TABLE IF EXISTS "jobs";
DROP TABLE IF EXISTS "companies";
DROP TYPE IF EXISTS "SignVideoStatus";
DROP TYPE IF EXISTS "AiFeature";
DROP TYPE IF EXISTS "ApplicationStatus";
DROP TYPE IF EXISTS "JobStatus";
DROP TYPE IF EXISTS "JobSource";
DROP TYPE IF EXISTS "WorkMode";
DROP TYPE IF EXISTS "EmploymentType";
DROP TYPE IF EXISTS "InclusivityStatus";
