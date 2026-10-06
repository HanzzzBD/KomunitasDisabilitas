import { Prisma } from "@prisma/client";
import {
  AUDIT_ACTION,
  auditMetaSchemas,
  type CommunityContentStatus,
  type CommunityReportTargetType,
  type CommunityModerationAction,
} from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import type { PosisiKursor } from "../../../core/pagination/index.js";
import type { CommunityRepository } from "./community.repository.js";

type Target = CommunityReportTargetType;
type Actor = { userId: string; requestId: string };
export interface ContentRow {
  id: string;
  communityId: string;
  postId: string | null;
  authorId: string | null;
  fullName: string | null;
  body: string;
  status: CommunityContentStatus;
  parentStatus: CommunityContentStatus;
  createdAt: Date;
  updatedAt: Date;
  commentCount: number;
}
type Db = Pick<AppPrisma, "$queryRaw">;

export function createCommunityContentRepository(prisma: AppPrisma, rooms: CommunityRepository) {
  async function read(db: Db, type: Target, id: string): Promise<ContentRow | null> {
    const rows =
      type === "post"
        ? await db.$queryRaw<
            ContentRow[]
          >`SELECT p.id, p.community_id AS "communityId", NULL::uuid AS "postId",
        p.author_id AS "authorId", u.full_name AS "fullName", p.body, p.status::text AS status,
        p.status::text AS "parentStatus", p.created_at AS "createdAt", p.updated_at AS "updatedAt",
        (SELECT count(*)::int FROM community_comments c WHERE c.post_id=p.id AND c.status='published') AS "commentCount"
        FROM community_posts p LEFT JOIN users u ON u.id=p.author_id AND u.deleted_at IS NULL WHERE p.id=${id}::uuid`
        : await db.$queryRaw<
            ContentRow[]
          >`SELECT c.id, p.community_id AS "communityId", c.post_id AS "postId",
        c.author_id AS "authorId", u.full_name AS "fullName", c.body, c.status::text AS status,
        p.status::text AS "parentStatus", c.created_at AS "createdAt", c.updated_at AS "updatedAt", 0::int AS "commentCount"
        FROM community_comments c JOIN community_posts p ON p.id=c.post_id
        LEFT JOIN users u ON u.id=c.author_id AND u.deleted_at IS NULL WHERE c.id=${id}::uuid`;
    return rows[0] ?? null;
  }
  async function audit(
    db: Prisma.TransactionClient,
    actor: Actor,
    type: Target,
    id: string,
    action:
      | typeof AUDIT_ACTION.COMMUNITY_CONTENT_MODERATED
      | typeof AUDIT_ACTION.COMMUNITY_REPORT_REJECTED,
    meta: unknown,
  ) {
    const auditId = uuidV7();
    await db.auditLog.create({
      data: {
        id: auditId,
        actorId: actor.userId,
        action,
        entity:
          action === AUDIT_ACTION.COMMUNITY_CONTENT_MODERATED
            ? `community.${type}`
            : "community.report",
        entityId: id,
        meta: { requestId: actor.requestId, ...auditMetaSchemas[action].parse(meta) },
      },
    });
    return auditId;
  }
  const receiptSelect = {
    id: true,
    targetType: true,
    targetId: true,
    status: true,
    createdAt: true,
  } as const;
  return {
    read: (type: Target, id: string) => read(prisma, type, id),
    inRoom<T>(
      id: string,
      actor: Actor,
      work: (
        ctx: Pick<
          Parameters<Parameters<CommunityRepository["inRoom"]>[2]>[0],
          "room" | "member" | "role"
        > & {
          createPost(body: string): Promise<ContentRow>;
        },
      ) => Promise<T>,
    ) {
      return rooms.inRoom(id, actor.userId, async ({ room, member, role, db }) =>
        work({
          room,
          member,
          role,
          async createPost(body) {
            const row = await db.communityPost.create({
              data: { id: uuidV7(), communityId: id, authorId: actor.userId, body },
            });
            return (await read(db, "post", row.id))!;
          },
        }),
      );
    },
    async inTarget<T>(
      type: Target,
      id: string,
      actor: Actor,
      work: (
        ctx: Pick<
          Parameters<Parameters<CommunityRepository["inRoom"]>[2]>[0],
          "room" | "member" | "role"
        > & {
          row: ContentRow;
          edit(body: string): Promise<ContentRow>;
          erase(): Promise<ContentRow>;
          comment(body: string): Promise<ContentRow>;
          hasOpenReports(): Promise<boolean>;
          report(reason: string): Promise<{
            row: Prisma.CommunityReportGetPayload<{ select: typeof receiptSelect }>;
            created: boolean;
          }>;
          moderate(
            action: CommunityModerationAction,
            reason: string,
          ): Promise<{ row: ContentRow; auditId: string }>;
        },
      ) => Promise<T>,
    ): Promise<T> {
      const ref = await read(prisma, type, id);
      if (!ref) throw appError("KONTEN_KOMUNITAS_TIDAK_DITEMUKAN");
      return rooms.inRoom(ref.communityId, actor.userId, async ({ room, member, role, db }) => {
        const postId = ref.postId ?? ref.id;
        await db.$queryRaw`SELECT id FROM community_posts WHERE id=${postId}::uuid FOR UPDATE`;
        if (type === "comment")
          await db.$queryRaw`SELECT id FROM community_comments WHERE id=${id}::uuid FOR UPDATE`;
        const row = await read(db, type, id);
        if (!row) throw appError("KONTEN_KOMUNITAS_TIDAK_DITEMUKAN");
        return work({
          room,
          member,
          role,
          row,
          async edit(body) {
            if (type === "post") await db.communityPost.update({ where: { id }, data: { body } });
            else await db.communityComment.update({ where: { id }, data: { body } });
            return (await read(db, type, id))!;
          },
          async erase() {
            if (type === "post")
              await db.communityPost.update({
                where: { id },
                data: { body: "", status: "removed" },
              });
            else
              await db.communityComment.update({
                where: { id },
                data: { body: "", status: "removed" },
              });
            return (await read(db, type, id))!;
          },
          async comment(body) {
            const c = await db.communityComment.create({
              data: { id: uuidV7(), postId: id, authorId: actor.userId, body },
            });
            return (await read(db, "comment", c.id))!;
          },
          async report(reason) {
            const where = {
              reporterId: actor.userId,
              targetType: type,
              targetId: id,
              status: "open" as const,
            };
            const previous = await db.communityReport.findFirst({ where, select: receiptSelect });
            return previous
              ? { row: previous, created: false }
              : {
                  row: await db.communityReport.create({
                    data: { id: uuidV7(), ...where, reason },
                    select: receiptSelect,
                  }),
                  created: true,
                };
          },
          async moderate(action, reason) {
            const status =
              action === "hide" ? "hidden" : action === "restore" ? "published" : "removed";
            // Locked together with status and mandatory audit: no unaudited moderation can commit.
            if (type === "post") await db.communityPost.update({ where: { id }, data: { status } });
            else await db.communityComment.update({ where: { id }, data: { status } });
            const closed =
              action === "restore"
                ? 0
                : (
                    await db.communityReport.updateMany({
                      where: { targetType: type, targetId: id, status: "open" },
                      data: {
                        status: "resolved",
                        resolvedBy: actor.userId,
                        resolvedAt: new Date(),
                      },
                    })
                  ).count;
            const auditId = await audit(
              db,
              actor,
              type,
              id,
              AUDIT_ACTION.COMMUNITY_CONTENT_MODERATED,
              { targetType: type, action, reason, resolvedReports: closed },
            );
            return { row: (await read(db, type, id))!, auditId };
          },
          async hasOpenReports() {
            return (
              (await db.communityReport.count({
                where: { targetType: type, targetId: id, status: "open" },
              })) > 0
            );
          },
        });
      });
    },
    async moderation(type: Target, id: string) {
      const row = await prisma.auditLog.findFirst({
        where: {
          entity: `community.${type}`,
          entityId: id,
          action: AUDIT_ACTION.COMMUNITY_CONTENT_MODERATED,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { meta: true, createdAt: true },
      });
      if (!row) return null;
      const parsed = auditMetaSchemas[AUDIT_ACTION.COMMUNITY_CONTENT_MODERATED].parse(row.meta);
      return {
        action: parsed.action as CommunityModerationAction,
        reason: parsed.reason as string,
        createdAt: row.createdAt.toISOString(),
      };
    },
    async comments(postId: string, limit: number, cursor?: PosisiKursor): Promise<ContentRow[]> {
      const after = cursor
        ? Prisma.sql`AND (c.created_at,c.id) > (COALESCE((SELECT created_at FROM community_comments WHERE id=${cursor.id}::uuid AND post_id=${postId}::uuid),${cursor.sortAt}),${cursor.id}::uuid)`
        : Prisma.empty;
      return prisma.$queryRaw<
        ContentRow[]
      >`SELECT c.id, p.community_id AS "communityId", c.post_id AS "postId", c.author_id AS "authorId", u.full_name AS "fullName", c.body, c.status::text AS status,
        p.status::text AS "parentStatus", c.created_at AS "createdAt", c.updated_at AS "updatedAt", 0::int AS "commentCount"
        FROM community_comments c JOIN community_posts p ON p.id=c.post_id LEFT JOIN users u ON u.id=c.author_id AND u.deleted_at IS NULL
        WHERE c.post_id=${postId}::uuid AND p.status='published' AND c.status='published' ${after}
        ORDER BY c.created_at ASC,c.id ASC LIMIT ${limit + 1}`;
    },
    async reports(limit: number, status?: "open" | "resolved" | "rejected", cursor?: PosisiKursor) {
      const filter = status ? Prisma.sql`AND r.status::text=${status}` : Prisma.empty;
      const after = cursor
        ? Prisma.sql`AND (r.created_at,r.id) > (COALESCE((SELECT created_at FROM community_reports WHERE id=${cursor.id}::uuid),${cursor.sortAt}),${cursor.id}::uuid)`
        : Prisma.empty;
      return prisma.$queryRaw<
        {
          id: string;
          targetType: Target;
          targetId: string;
          status: "open" | "resolved" | "rejected";
          createdAt: Date;
          reason: string;
          reporterId: string;
          resolvedBy: string | null;
          resolvedAt: Date | null;
        }[]
      >`SELECT r.id,r.target_type::text AS "targetType",r.target_id AS "targetId",r.status::text AS status,r.created_at AS "createdAt",r.reason,r.reporter_id AS "reporterId",r.resolved_by AS "resolvedBy",r.resolved_at AS "resolvedAt"
        FROM community_reports r WHERE TRUE ${filter} ${after} ORDER BY r.created_at ASC,r.id ASC LIMIT ${limit + 1}`;
    },
    async reject(id: string, actor: Actor, reason: string) {
      return prisma.$transaction(async (db) => {
        const users = await db.$queryRaw<
          { role: string }[]
        >`SELECT role::text FROM users WHERE id=${actor.userId}::uuid AND deleted_at IS NULL AND suspended_at IS NULL FOR SHARE`;
        if (!users[0]) throw appError("SESI_TIDAK_VALID");
        if (users[0].role !== "admin") throw appError("TIDAK_BERHAK");
        await db.$queryRaw`SELECT id FROM community_reports WHERE id=${id}::uuid FOR UPDATE`;
        const row = await db.communityReport.findUnique({ where: { id } });
        if (!row) throw appError("LAPORAN_KOMUNITAS_TIDAK_DITEMUKAN");
        if (row.status !== "open") throw appError("LAPORAN_KOMUNITAS_DITUTUP");
        const updated = await db.communityReport.update({
          where: { id },
          data: { status: "rejected", resolvedBy: actor.userId, resolvedAt: new Date() },
        });
        await audit(db, actor, row.targetType, id, AUDIT_ACTION.COMMUNITY_REPORT_REJECTED, {
          reason,
        });
        return updated;
      });
    },
    exportPosts: (userId: string) =>
      prisma.communityPost.findMany({
        where: { authorId: userId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          communityId: true,
          body: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    exportComments: (userId: string) =>
      prisma.communityComment.findMany({
        where: { authorId: userId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          postId: true,
          body: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    exportReports: (userId: string) =>
      prisma.communityReport.findMany({
        where: { reporterId: userId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { ...receiptSelect, reason: true, resolvedAt: true },
      }),
  };
}
export type CommunityContentRepository = ReturnType<typeof createCommunityContentRepository>;
