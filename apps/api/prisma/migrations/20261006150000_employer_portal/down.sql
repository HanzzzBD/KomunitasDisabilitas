DROP TABLE "employer_members";
ALTER TABLE "companies" DROP CONSTRAINT "companies_recruitment_status_check";
ALTER TABLE "companies" DROP COLUMN "recruitment_status";
