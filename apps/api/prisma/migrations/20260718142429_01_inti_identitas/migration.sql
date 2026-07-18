-- CreateEnum
CREATE TYPE "Role" AS ENUM ('seeker', 'admin', 'employer');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT,
    "google_id" TEXT,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'seeker',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessibility_profiles" (
    "user_id" UUID NOT NULL,
    "text_scale" INTEGER NOT NULL DEFAULT 100,
    "high_contrast" BOOLEAN NOT NULL DEFAULT false,
    "reduce_motion" BOOLEAN NOT NULL DEFAULT false,
    "simple_language" BOOLEAN NOT NULL DEFAULT false,
    "prefers_sign_language" BOOLEAN NOT NULL DEFAULT false,
    "large_touch_targets" BOOLEAN NOT NULL DEFAULT false,
    "screen_reader_hint" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accessibility_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessibility_profiles" ADD CONSTRAINT "accessibility_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Raw SQL di luar dukungan Prisma (konvensi SDD §6.2) =====

-- Unique PARSIAL users aktif: nomor/akun Google boleh dipakai ulang setelah
-- soft delete (hak hapus UU PDP; purge ≤30 hari, SDD §6.4). Query login WAJIB
-- filter deleted_at IS NULL — lihat prisma/README.md.
CREATE UNIQUE INDEX "users_phone_aktif_key" ON "users" ("phone") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_google_id_aktif_key" ON "users" ("google_id") WHERE "deleted_at" IS NULL;

-- BRIN untuk tabel append-only besar (SDD §6.3): hemat, cukup untuk range scan waktu.
CREATE INDEX "audit_logs_created_at_brin" ON "audit_logs" USING BRIN ("created_at");
