-- Hanya untuk drill up/down/up pada DB uji kosong. RB-Std produksi mempertahankan
-- skema ini ketika image di-rollback; jangan menghapus diskusi pengguna.
BEGIN;
DROP TABLE "community_reports";
DROP TABLE "community_comments";
DROP TABLE "community_posts";
DROP TABLE "community_memberships";
DROP TABLE "communities";
DROP TYPE "CommunityReportStatus";
DROP TYPE "CommunityReportTargetType";
DROP TYPE "CommunityContentStatus";
DROP TYPE "CommunityMembershipStatus";
DROP TYPE "CommunityStatus";
DROP TYPE "CommunityType";
COMMIT;
