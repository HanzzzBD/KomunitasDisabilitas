// PR-113: Community harus ikut dua jalur purge, termasuk user yang tetap hidup
// untuk hired count. Keputusan owner 2026-10-06: body kosong + removed.
import type { Prisma } from "@prisma/client";

export const COMMUNITY_PURGE_MODELS = [
  "community",
  "communityPost",
  "communityComment",
  "communityReport",
] as const;
type Client = Pick<Prisma.TransactionClient, (typeof COMMUNITY_PURGE_MODELS)[number]>;

/** Hitung baris terdampak SEKALI, termasuk report milik resolver yang berbeda. */
export async function countCommunityPurgeRows(db: Client, userId: string): Promise<number> {
  const counts = await Promise.all([
    db.community.count({ where: { createdBy: userId } }),
    db.communityPost.count({ where: { authorId: userId } }),
    db.communityComment.count({ where: { authorId: userId } }),
    db.communityReport.count({ where: { reporterId: userId } }),
    db.communityReport.count({ where: { resolvedBy: userId, reporterId: { not: userId } } }),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

export async function purgeCommunityRows(db: Client, userId: string): Promise<void> {
  // IDs/timestamp/report tentang konten tetap; body dapat memuat identitas juga.
  await db.communityPost.updateMany({
    where: { authorId: userId },
    data: { authorId: null, body: "", status: "removed" },
  });
  await db.communityComment.updateMany({
    where: { authorId: userId },
    data: { authorId: null, body: "", status: "removed" },
  });
  await db.community.updateMany({ where: { createdBy: userId }, data: { createdBy: null } });
  await db.communityReport.deleteMany({ where: { reporterId: userId } });
  await db.communityReport.updateMany({
    where: { resolvedBy: userId },
    data: { resolvedBy: null },
  });
}
