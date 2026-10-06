ALTER TABLE "companies" ADD COLUMN "recruitment_status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "companies" ADD CONSTRAINT "companies_recruitment_status_check" CHECK ("recruitment_status" IN ('pending', 'approved', 'rejected'));
CREATE TABLE "employer_members" (
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'owner' CHECK ("role" IN ('owner', 'recruiter')),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("company_id", "user_id")
);
CREATE INDEX "employer_members_user_id_idx" ON "employer_members"("user_id");
