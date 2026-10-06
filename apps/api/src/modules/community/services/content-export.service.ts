import type { ExportContributor } from "../../users/services/export.service.js";
import type { CommunityContentRepository } from "../repositories/content.repository.js";
const content = <T extends { createdAt: Date; updatedAt: Date; status: string; body: string }>(
  r: T,
) => ({
  ...r,
  body: r.status === "removed" ? "" : r.body,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
export function createCommunityContentExports(
  repo: CommunityContentRepository,
): ExportContributor[] {
  return [
    {
      bagian: "communityPosts",
      async kumpulkan(userId) {
        return (await repo.exportPosts(userId)).map(content);
      },
    },
    {
      bagian: "communityComments",
      async kumpulkan(userId) {
        return (await repo.exportComments(userId)).map(content);
      },
    },
    {
      bagian: "communityReports",
      async kumpulkan(userId) {
        return (await repo.exportReports(userId)).map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt?.toISOString() ?? null,
        }));
      },
    },
  ];
}
