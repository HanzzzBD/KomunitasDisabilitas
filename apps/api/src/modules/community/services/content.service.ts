import {
  type CommunityPost,
  type CommunityComment,
  type CommunityReportTargetType,
  type CommunityModerationAction,
  type CommunityReportListQuery,
} from "@nawasena/schemas";
import type { EventBus } from "../../../core/events/index.js";
import { appError } from "../../../core/http/index.js";
import type { CommunityActor } from "./community.service.js";
import { assertCommunityWrite, communityCursor, communityPage } from "./community.service.js";
import type { CommunityContentRepository, ContentRow } from "../repositories/content.repository.js";
import type { CommunityRateRepository } from "../repositories/rate-limit.repository.js";

export interface CommunityContentPolicy {
  postMaxLength: number;
  commentMaxLength: number;
  createMax: number;
  reportMax: number;
  windowMs: number;
}
export const COMMUNITY_CONTENT_POLICY: CommunityContentPolicy = {
  postMaxLength: 5000,
  commentMaxLength: 2000,
  createMax: 10,
  reportMax: 5,
  windowMs: 60_000,
};
const visible = (row: ContentRow) =>
  row.status === "published" && (row.postId === null || row.parentStatus === "published");
function requireVisible(row: ContentRow | null): asserts row is ContentRow {
  if (!row || !visible(row)) throw appError("KONTEN_KOMUNITAS_TIDAK_DITEMUKAN");
}
function requireOwner(row: ContentRow, userId: string) {
  if (row.authorId !== userId) throw appError("KONTEN_KOMUNITAS_TIDAK_DITEMUKAN");
}
function contentBase(row: ContentRow, admin = false) {
  return {
    id: row.id,
    author:
      row.authorId && row.fullName !== null ? { id: row.authorId, fullName: row.fullName } : null,
    body: row.status === "removed" && !admin ? "" : row.body,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export const postResponse = (row: ContentRow, admin = false): CommunityPost => ({
  ...contentBase(row, admin),
  communityId: row.communityId,
  commentCount: row.commentCount,
});
export const commentResponse = (row: ContentRow, admin = false): CommunityComment => ({
  ...contentBase(row, admin),
  postId: row.postId!,
});
const reportResponse = <T extends { createdAt: Date; resolvedAt?: Date | null }>(row: T) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  ...(row.resolvedAt === undefined ? {} : { resolvedAt: row.resolvedAt?.toISOString() ?? null }),
});

export function createCommunityContentService(deps: {
  repository: CommunityContentRepository;
  rate: CommunityRateRepository;
  events: EventBus;
  policy?: CommunityContentPolicy;
}) {
  const { repository: repo, events, rate } = deps;
  const policy = deps.policy ?? COMMUNITY_CONTENT_POLICY;
  async function present(
    type: CommunityReportTargetType,
    row: ContentRow,
    userId?: string,
    admin = false,
  ) {
    const content = type === "post" ? postResponse(row, admin) : commentResponse(row, admin);
    if (admin || row.authorId === userId) content.moderation = await repo.moderation(type, row.id);
    return content;
  }
  return {
    policy,
    async checkRate(bucket: "create" | "report", userId: string) {
      let count;
      try {
        count = await rate.bump(bucket, userId, policy.windowMs);
      } catch {
        throw appError("BELUM_SIAP", {
          message: "Layanan komunitas belum tersedia",
          retryAfterSeconds: 5,
        });
      }
      if (count.value > (bucket === "create" ? policy.createMax : policy.reportMax))
        throw appError("TERLALU_BANYAK_PERMINTAAN", { retryAfterSeconds: count.retryAfterSeconds });
    },
    async createPost(actor: CommunityActor, roomId: string, body: string) {
      const row = await repo.inRoom(roomId, actor, async ({ room, member, createPost }) => {
        assertCommunityWrite(room, member);
        return createPost(body);
      });
      return postResponse(row);
    },
    async detail(actor: CommunityActor, type: CommunityReportTargetType, id: string) {
      const row = await repo.read(type, id);
      if (!row || (!visible(row) && row.authorId !== actor.userId))
        throw appError("KONTEN_KOMUNITAS_TIDAK_DITEMUKAN");
      return present(type, row, actor.userId);
    },
    async edit(actor: CommunityActor, type: CommunityReportTargetType, id: string, body: string) {
      const row = await repo.inTarget(type, id, actor, async (ctx) => {
        requireOwner(ctx.row, actor.userId);
        assertCommunityWrite(ctx.room, ctx.member);
        if (ctx.row.status === "removed") throw appError("KONTEN_KOMUNITAS_DIHAPUS");
        return ctx.edit(body); // Editing hidden content never republishes it.
      });
      return present(type, row, actor.userId);
    },
    async erase(actor: CommunityActor, type: CommunityReportTargetType, id: string) {
      const row = await repo.inTarget(type, id, actor, async (ctx) => {
        requireOwner(ctx.row, actor.userId);
        // Owners may remove their text even after leaving, blocking or archive.
        if (ctx.row.body === "" && ctx.row.status === "removed") return ctx.row;
        return ctx.erase();
      });
      return present(type, row, actor.userId);
    },
    async createComment(actor: CommunityActor, postId: string, body: string) {
      const row = await repo.inTarget("post", postId, actor, async (ctx) => {
        requireVisible(ctx.row);
        assertCommunityWrite(ctx.room, ctx.member);
        return ctx.comment(body);
      });
      return commentResponse(row);
    },
    async comments(postId: string, query: { limit: number; cursor?: string }) {
      requireVisible(await repo.read("post", postId));
      const { page, meta } = communityPage(
        await repo.comments(postId, query.limit, communityCursor(query.cursor)),
        query.limit,
      );
      return { data: page.map((row) => commentResponse(row)), meta };
    },
    async report(
      actor: CommunityActor,
      type: CommunityReportTargetType,
      id: string,
      reason: string,
    ) {
      const result = await repo.inTarget(type, id, actor, async (ctx) => {
        requireVisible(ctx.row);
        const report = await ctx.report(reason);
        return { ...report, communityId: ctx.row.communityId };
      });
      if (result.created)
        events.emit("community.content_reported", {
          reportId: result.row.id,
          communityId: result.communityId,
          targetType: type,
          targetId: id,
        });
      return { data: reportResponse(result.row), created: result.created };
    },
    async adminContent(type: CommunityReportTargetType, id: string) {
      const row = await repo.read(type, id);
      if (!row) throw appError("KONTEN_KOMUNITAS_TIDAK_DITEMUKAN");
      return { targetType: type, content: await present(type, row, undefined, true) };
    },
    async moderate(
      actor: CommunityActor,
      type: CommunityReportTargetType,
      id: string,
      action: CommunityModerationAction,
      reason: string,
    ) {
      const result = await repo.inTarget(type, id, actor, async (ctx) => {
        if (ctx.role !== "admin") throw appError("TIDAK_BERHAK");
        if (ctx.row.status === "removed" && action !== "remove")
          throw appError("KONTEN_KOMUNITAS_DIHAPUS");
        const desired =
          action === "hide" ? "hidden" : action === "restore" ? "published" : "removed";
        if (ctx.row.status === desired && (action === "restore" || !(await ctx.hasOpenReports())))
          return { row: ctx.row, auditId: null };
        return ctx.moderate(action, reason);
      });
      if (result.auditId)
        events.emit("community.content_moderated", {
          auditId: result.auditId,
          communityId: result.row.communityId,
          targetType: type,
          targetId: id,
          authorId: result.row.fullName === null ? null : result.row.authorId,
          action,
        });
      return { targetType: type, content: await present(type, result.row, undefined, true) };
    },
    async reports(query: CommunityReportListQuery) {
      const { page, meta } = communityPage(
        await repo.reports(query.limit, query.status, communityCursor(query.cursor)),
        query.limit,
      );
      return { data: page.map(reportResponse), meta };
    },
    async reject(actor: CommunityActor, id: string, reason: string) {
      const { reporterId, resolvedBy, ...row } = await repo.reject(id, actor, reason);
      return { ...reportResponse(row), reporterId, resolvedBy };
    },
  };
}
export type CommunityContentService = ReturnType<typeof createCommunityContentService>;
