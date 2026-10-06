import type { CommunityReportListQuery } from "@nawasena/schemas";
import { appError } from "../../../core/http/index.js";
import type { CommunityAdminRepository } from "../repositories/admin.repository.js";
import { communityCursor, communityPage } from "./community.service.js";
import type { CommunityContentService } from "./content.service.js";
function present(row: NonNullable<Awaited<ReturnType<CommunityAdminRepository["report"]>>>) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}
export function createCommunityAdminService(
  repo: CommunityAdminRepository,
  content: CommunityContentService,
) {
  return {
    async queue(query: CommunityReportListQuery) {
      const { page, meta } = communityPage(
        await repo.queue(query.limit, query.status, communityCursor(query.cursor)),
        query.limit,
      );
      return { data: page.map(present), meta };
    },
    async report(id: string) {
      const row = await repo.report(id);
      if (!row) throw appError("LAPORAN_KOMUNITAS_TIDAK_DITEMUKAN");
      return present(row);
    },
    metrics: () => repo.metrics(new Date()),
    async reject(...args: Parameters<CommunityContentService["reject"]>) {
      const result = await content.reject(...args);
      const { reporterId: _reporter, resolvedBy: _resolver, ...row } = result;
      return row;
    },
  };
}
export type CommunityAdminService = ReturnType<typeof createCommunityAdminService>;
