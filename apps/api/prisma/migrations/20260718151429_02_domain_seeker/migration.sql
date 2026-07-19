-- Ekstensi pgvector — WAJIB di sini (self-contained): migrate reset men-drop
-- schema public (extension ikut hilang) dan service Postgres CI tidak
-- menjalankan infra/pg-init.sql (hanya mount compose dev).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "DisclosureDefault" AS ENUM ('never', 'ask_each_time', 'always');

-- CreateEnum
CREATE TYPE "ResumeCreatedVia" AS ENUM ('ai_chat', 'manual');


-- CreateTable
CREATE TABLE "seeker_profiles" (
    "user_id" UUID NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "city" TEXT,
    "province" TEXT,
    "open_to_remote" BOOLEAN NOT NULL DEFAULT false,
    "disability_types" BYTEA,
    "accommodation_needs" BYTEA,
    "disclosure_default" "DisclosureDefault" NOT NULL DEFAULT 'ask_each_time',
    "consent_sensitive_at" TIMESTAMPTZ(6),
    "profile_embedding" vector(768),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seeker_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "description" TEXT,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "field" TEXT,
    "year" INTEGER,

    CONSTRAINT "educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "pdf_url" TEXT,
    "created_via" "ResumeCreatedVia" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experiences_user_id_idx" ON "experiences"("user_id");

-- CreateIndex
CREATE INDEX "educations_user_id_idx" ON "educations"("user_id");

-- CreateIndex
CREATE INDEX "skills_user_id_idx" ON "skills"("user_id");

-- CreateIndex
CREATE INDEX "resumes_user_id_idx" ON "resumes"("user_id");

-- AddForeignKey
ALTER TABLE "seeker_profiles" ADD CONSTRAINT "seeker_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educations" ADD CONSTRAINT "educations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Raw SQL di luar dukungan Prisma (konvensi SDD §6.2) =====

-- HNSW cosine untuk matching (SDD §6.3). Dibuat saat tabel kosong (build
-- instan); parameter default — tuning menyusul via pg_stat_statements.
CREATE INDEX "seeker_profiles_embedding_hnsw" ON "seeker_profiles"
  USING hnsw ("profile_embedding" vector_cosine_ops);
