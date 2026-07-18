-- Down migration 02_domain_seeker (up→down→up teruji; lihat prisma/README.md).
-- Extension vector TIDAK di-drop: dipakai migrasi lain (jobs, PR-011).
DROP TABLE IF EXISTS "resumes";
DROP TABLE IF EXISTS "skills";
DROP TABLE IF EXISTS "educations";
DROP TABLE IF EXISTS "experiences";
DROP TABLE IF EXISTS "seeker_profiles";
DROP TYPE IF EXISTS "ResumeCreatedVia";
DROP TYPE IF EXISTS "DisclosureDefault";
