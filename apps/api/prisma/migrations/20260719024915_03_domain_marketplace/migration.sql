-- CreateEnum
CREATE TYPE "InclusivityStatus" AS ENUM ('unverified', 'self_claimed', 'verified');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract', 'internship', 'freelance');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('onsite', 'hybrid', 'remote');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('admin_curated', 'employer', 'aggregated');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('draft', 'published', 'closed');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('submitted', 'viewed', 'in_review', 'interview', 'offered', 'hired', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('cv_chat', 'cv_finalize', 'cv_check', 'simplify_text', 'interview_sim', 'rerank', 'embed');

-- CreateEnum
CREATE TYPE "SignVideoStatus" AS ENUM ('draft', 'published');


-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "city" TEXT,
    "inclusivity_status" "InclusivityStatus" NOT NULL DEFAULT 'unverified',
    "accommodations_available" JSONB NOT NULL DEFAULT '[]',
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "employment_type" "EmploymentType" NOT NULL,
    "work_mode" "WorkMode" NOT NULL,
    "city" TEXT,
    "province" TEXT,
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "salary_visible" BOOLEAN NOT NULL DEFAULT true,
    "accommodations" JSONB NOT NULL DEFAULT '[]',
    "welcomed_disability_types" TEXT[],
    "source" "JobSource" NOT NULL DEFAULT 'admin_curated',
    "status" "JobStatus" NOT NULL DEFAULT 'draft',
    "job_embedding" vector(768),
    "created_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "resume_id" UUID,
    "disclose_disability" BOOLEAN NOT NULL DEFAULT false,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "status_history" JSONB NOT NULL DEFAULT '[]',
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "hired_confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_scores" (
    "user_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "score" DECIMAL(5,4) NOT NULL,
    "explanation" TEXT,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_scores_pkey" PRIMARY KEY ("user_id","job_id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "provider" TEXT NOT NULL,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sign_videos" (
    "id" UUID NOT NULL,
    "phrase" TEXT NOT NULL,
    "category" TEXT,
    "video_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "duration_s" INTEGER,
    "status" "SignVideoStatus" NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sign_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "applications_user_id_job_id_key" ON "applications"("user_id", "job_id");

-- CreateIndex
CREATE INDEX "match_scores_computed_at_idx" ON "match_scores"("computed_at");

-- CreateIndex
CREATE INDEX "ai_usage_user_id_feature_created_at_idx" ON "ai_usage"("user_id", "feature", "created_at");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sign_videos" ADD CONSTRAINT "sign_videos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== Raw SQL di luar dukungan Prisma (SDD §6.3, ADR-018) =====

-- pg_trgm self-contained (pelajaran PR-010: CI tidak menjalankan pg-init.sql).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- FTS bahasa Indonesia: pencarian lowongan adalah jalur non-AI kelas satu.
CREATE INDEX "jobs_fts_gin" ON "jobs" USING GIN (
  to_tsvector('indonesian', coalesce("title", '') || ' ' || coalesce("description", ''))
);

-- Trigram title: toleransi typo (ADR-018).
CREATE INDEX "jobs_title_trgm" ON "jobs" USING GIN ("title" gin_trgm_ops);

-- Filter akomodasi feed: jsonb_path_ops (lebih kecil/cepat untuk @> containment).
CREATE INDEX "jobs_accommodations_gin" ON "jobs" USING GIN ("accommodations" jsonb_path_ops);

-- Matching lowongan (pola sama seeker_profiles, PR-010).
CREATE INDEX "jobs_embedding_hnsw" ON "jobs" USING hnsw ("job_embedding" vector_cosine_ops);

-- Feed lowongan aktif terbaru.
CREATE INDEX "jobs_status_published_at" ON "jobs" ("status", "published_at" DESC);

-- Badge unread: partial index hanya baris belum dibaca (SDD §6.3).
CREATE INDEX "notifications_unread" ON "notifications" ("user_id", "read_at" NULLS FIRST, "created_at" DESC)
  WHERE "read_at" IS NULL;

-- Tracking lamaran user & tinjauan admin per lowongan.
CREATE INDEX "applications_user_updated" ON "applications" ("user_id", "updated_at" DESC);
CREATE INDEX "applications_job_status" ON "applications" ("job_id", "status");

-- FTS kamus BISINDO (SDD §6.2 poin 5).
CREATE INDEX "sign_videos_phrase_fts" ON "sign_videos" USING GIN (
  to_tsvector('indonesian', "phrase")
);
