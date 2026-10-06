-- PR-113: expand-only. Tidak ALTER/backfill tabel v1.0.0 atau indeks lama.
-- FK ke users hanya memerlukan lock singkat saat memasang relasi baru.
-- Lock yang tidak segera tersedia membatalkan migrasi agar dapat dicoba ulang.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TYPE "CommunityType" AS ENUM ('topic', 'city');
CREATE TYPE "CommunityStatus" AS ENUM ('active', 'archived');
CREATE TYPE "CommunityMembershipStatus" AS ENUM ('active', 'blocked');
CREATE TYPE "CommunityContentStatus" AS ENUM ('published', 'hidden', 'removed');
CREATE TYPE "CommunityReportTargetType" AS ENUM ('post', 'comment');
CREATE TYPE "CommunityReportStatus" AS ENUM ('open', 'resolved', 'rejected');

CREATE TABLE "communities" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "type" "CommunityType" NOT NULL,
  "city" TEXT,
  "status" "CommunityStatus" NOT NULL DEFAULT 'active',
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "communities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "communities_city_sesuai_type" CHECK (
    ("type" = 'city' AND "city" IS NOT NULL AND length(btrim("city")) > 0)
    OR ("type" = 'topic' AND "city" IS NULL)
  ),
  CONSTRAINT "communities_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "community_memberships" (
  "community_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "CommunityMembershipStatus" NOT NULL DEFAULT 'active',
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_memberships_pkey" PRIMARY KEY ("community_id", "user_id"),
  CONSTRAINT "community_memberships_community_id_fkey" FOREIGN KEY ("community_id")
    REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_memberships_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "community_posts" (
  "id" UUID NOT NULL,
  "community_id" UUID NOT NULL,
  "author_id" UUID,
  "body" TEXT NOT NULL,
  "status" "CommunityContentStatus" NOT NULL DEFAULT 'published',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_posts_body_sesuai_status" CHECK ("status" = 'removed' OR length(btrim("body")) > 0),
  CONSTRAINT "community_posts_community_id_fkey" FOREIGN KEY ("community_id")
    REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY ("author_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "community_comments" (
  "id" UUID NOT NULL,
  "post_id" UUID NOT NULL,
  "author_id" UUID,
  "body" TEXT NOT NULL,
  "status" "CommunityContentStatus" NOT NULL DEFAULT 'published',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_comments_body_sesuai_status" CHECK ("status" = 'removed' OR length(btrim("body")) > 0),
  CONSTRAINT "community_comments_post_id_fkey" FOREIGN KEY ("post_id")
    REFERENCES "community_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "community_comments_author_id_fkey" FOREIGN KEY ("author_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "community_reports" (
  "id" UUID NOT NULL,
  "reporter_id" UUID NOT NULL,
  "target_type" "CommunityReportTargetType" NOT NULL,
  "target_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "CommunityReportStatus" NOT NULL DEFAULT 'open',
  "resolved_by" UUID,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_reports_reason_nonempty" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "community_reports_resolved_at_sesuai_status" CHECK (
    ("status" = 'open' AND "resolved_at" IS NULL AND "resolved_by" IS NULL)
    OR ("status" <> 'open' AND "resolved_at" IS NOT NULL)
  ),
  CONSTRAINT "community_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");
CREATE INDEX "community_memberships_user_id_joined_at_idx" ON "community_memberships"("user_id", "joined_at" DESC);
CREATE INDEX "community_posts_community_id_status_created_at_id_idx" ON "community_posts"("community_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "community_posts_author_id_idx" ON "community_posts"("author_id");
CREATE INDEX "community_comments_post_id_status_created_at_id_idx" ON "community_comments"("post_id", "status", "created_at", "id");
CREATE INDEX "community_comments_author_id_idx" ON "community_comments"("author_id");
CREATE INDEX "community_reports_status_created_at_id_idx" ON "community_reports"("status", "created_at", "id");
CREATE INDEX "community_reports_reporter_id_idx" ON "community_reports"("reporter_id");
-- Config indonesian sama dengan FTS migrasi 03. Ekspresi query PR-114/116 harus sama.
CREATE INDEX "community_posts_body_fts_gin" ON "community_posts" USING GIN (to_tsvector('indonesian', "body"));
COMMIT;
