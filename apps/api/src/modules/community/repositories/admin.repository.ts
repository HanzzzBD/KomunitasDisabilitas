import { Prisma } from "@prisma/client";
import type { CommunityMetrics, CommunityReportStatus } from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";
import type { PosisiKursor } from "../../../core/pagination/index.js";
const reportSelect = {
  id: true,
  targetType: true,
  targetId: true,
  status: true,
  reason: true,
  createdAt: true,
  resolvedAt: true,
} as const;
type ReportRow = Prisma.CommunityReportGetPayload<{ select: typeof reportSelect }>;
export function createCommunityAdminRepository(prisma: AppPrisma) {
  return {
    report: (id: string) =>
      prisma.communityReport.findUnique({ where: { id }, select: reportSelect }),
    async queue(limit: number, status?: CommunityReportStatus, cursor?: PosisiKursor) {
      const filter = status ? Prisma.sql`AND r.status::text=${status}` : Prisma.empty;
      const after = cursor
        ? Prisma.sql`AND (r.created_at,r.id) > (COALESCE((SELECT created_at FROM community_reports WHERE id=${cursor.id}::uuid),${cursor.sortAt}),${cursor.id}::uuid)`
        : Prisma.empty;
      return prisma.$queryRaw<
        ReportRow[]
      >`SELECT r.id, r.target_type::text AS "targetType", r.target_id AS "targetId", r.status::text AS status, r.reason, r.created_at AS "createdAt", r.resolved_at AS "resolvedAt"
        FROM community_reports r WHERE TRUE ${filter} ${after} ORDER BY r.created_at ASC,r.id ASC LIMIT ${limit + 1}`;
    },
    async metrics(to: Date): Promise<CommunityMetrics> {
      const from = new Date(to.getTime() - 30 * 86_400_000);
      // One statement, one snapshot, aggregate-only. No identity leaves this repository.
      const [row] = await prisma.$queryRaw<
        Omit<CommunityMetrics, "periodDays" | "from" | "to">[]
      >`SELECT
        (SELECT count(*)::int FROM community_memberships m JOIN users u ON u.id=m.user_id WHERE m.joined_at >= ${from} AND m.joined_at <= ${to} AND m.status='active' AND u.deleted_at IS NULL AND u.suspended_at IS NULL) AS "newMemberships",
        (SELECT count(*)::int FROM community_posts WHERE created_at >= ${from} AND created_at <= ${to}) AS posts,
        (SELECT count(*)::int FROM community_reports WHERE status='open') AS "openReports",
        (SELECT count(*)::int FROM community_reports WHERE status IN ('resolved','rejected') AND resolved_at >= ${from} AND resolved_at <= ${to}) AS "closedReports",
        (SELECT avg(greatest(0,extract(epoch FROM (resolved_at-created_at))))::float8 FROM community_reports WHERE status IN ('resolved','rejected') AND resolved_at >= ${from} AND resolved_at <= ${to}) AS "averageResolutionSeconds"`;
      return { ...row!, periodDays: 30, from: from.toISOString(), to: to.toISOString() };
    },
  };
}
export type CommunityAdminRepository = ReturnType<typeof createCommunityAdminRepository>;
