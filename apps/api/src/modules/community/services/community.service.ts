import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  AUDIT_ACTION,
  createCommunitySchema,
  type Community,
  type CommunityFeedQuery,
  type CommunityFeedResponse,
  type CommunityListQuery,
  type CommunityAdminListQuery,
  type CommunityListResponse,
  type CommunityMembership,
  type CreateCommunity,
  type UpdateCommunity,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { EventBus } from "../../../core/events/index.js";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import {
  decodeKursor,
  encodeKursor,
  KursorTidakValidError,
} from "../../../core/pagination/index.js";
import type {
  CommunityRepository,
  MemberRow,
  RoomRow,
} from "../repositories/community.repository.js";
import type { CommunityRateRepository } from "../repositories/rate-limit.repository.js";

export interface CommunityActor {
  userId: string;
  requestId: string;
}
export interface CommunityPolicy {
  readMax: number;
  writeMax: number;
  windowMs: number;
}
export const COMMUNITY_POLICY: CommunityPolicy = { readMax: 120, writeMax: 20, windowMs: 60_000 };
const roomResponse = (r: RoomRow): Community => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  type: r.type,
  city: r.city,
  status: r.status,
  memberCount: r._count.memberships,
  membershipStatus: null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
export const memberResponse = (r: MemberRow): CommunityMembership => ({
  communityId: r.communityId,
  status: r.status,
  joinedAt: r.joinedAt.toISOString(),
});
export function communityCursor(cursor?: string) {
  if (!cursor) return undefined;
  try {
    const position = decodeKursor(cursor);
    if (!z.string().uuid().safeParse(position.id).success) throw new KursorTidakValidError();
    return position;
  } catch (e) {
    if (e instanceof KursorTidakValidError)
      throw appError("VALIDATION_ERROR", { message: "Cursor tidak valid" });
    throw e;
  }
}
export function communityPage<T extends { id: string; createdAt: Date }>(rows: T[], limit: number) {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    page,
    meta: {
      nextCursor:
        rows.length > limit && last ? encodeKursor({ sortAt: last.createdAt, id: last.id }) : null,
    },
  };
}
export function assertCommunityWrite(room: RoomRow, member: MemberRow | null) {
  if (room.status !== "active") throw appError("KOMUNITAS_DIARSIPKAN");
  if (member?.status !== "active")
    throw appError(
      member?.status === "blocked" ? "KEANGGOTAAN_DIBLOKIR" : "BUKAN_ANGGOTA_KOMUNITAS",
    );
}
async function uniqueSlug<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw appError("SLUG_KOMUNITAS_DIPAKAI");
    throw e;
  }
}
export function createCommunityService(deps: {
  repository: CommunityRepository;
  rate: CommunityRateRepository;
  auditLog: AuditLog;
  events: EventBus;
  policy?: CommunityPolicy;
}) {
  const { repository: repo, auditLog, events, rate } = deps;
  const policy = deps.policy ?? COMMUNITY_POLICY;
  const audit = (actor: CommunityActor, id: string, operation: "create" | "update" | "close") =>
    auditLog(
      { actorId: actor.userId, requestId: actor.requestId },
      AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
      "community.room",
      id,
      { operation },
    );
  return {
    async checkRate(bucket: "read" | "write", key: string) {
      let count;
      try {
        count = await rate.bump(bucket, key, policy.windowMs);
      } catch {
        throw appError("BELUM_SIAP", {
          message: "Layanan Community sedang tidak tersedia",
          retryAfterSeconds: 5,
        });
      }
      if (count.value > (bucket === "read" ? policy.readMax : policy.writeMax))
        throw appError("TERLALU_BANYAK_PERMINTAAN", { retryAfterSeconds: count.retryAfterSeconds });
    },
    async list(
      query: CommunityListQuery | CommunityAdminListQuery,
      admin = false,
    ): Promise<CommunityListResponse> {
      const { page, meta } = communityPage(
        await repo.list(query, communityCursor(query.cursor), admin),
        query.limit,
      );
      return { data: page.map(roomResponse), meta };
    },
    async detail(slug: string): Promise<Community> {
      const row = await repo.findBySlug(slug);
      if (!row) throw appError("KOMUNITAS_TIDAK_DITEMUKAN");
      return roomResponse(row);
    },
    async detailById(id: string): Promise<Community> {
      const row = await repo.findById(id);
      if (!row) throw appError("KOMUNITAS_TIDAK_DITEMUKAN");
      return roomResponse(row);
    },
    async membership(userId: string, id: string): Promise<CommunityMembership | null> {
      if (!(await repo.findById(id))) throw appError("KOMUNITAS_TIDAK_DITEMUKAN");
      const row = await repo.findMember(id, userId);
      return row ? memberResponse(row) : null;
    },
    async join(actor: CommunityActor, id: string): Promise<CommunityMembership> {
      const result = await repo.inRoom(id, actor.userId, async ({ room, member, join }) => {
        if (room.status !== "active") throw appError("KOMUNITAS_DIARSIPKAN");
        if (member?.status === "blocked") throw appError("KEANGGOTAAN_DIBLOKIR");
        return { member: member ?? (await join()), created: member === null };
      });
      if (result.created)
        events.emit("community.member_joined", {
          communityId: id,
          userId: actor.userId,
          joinedAt: result.member.joinedAt.toISOString(),
        });
      return memberResponse(result.member);
    },
    async leave(actor: CommunityActor, id: string): Promise<null> {
      await repo.inRoom(id, actor.userId, async ({ member, leave }) => {
        if (member?.status === "blocked") throw appError("KEANGGOTAAN_DIBLOKIR");
        await leave();
      });
      return null;
    },
    // PR-116 must use the same guard inside its write transaction, not a stale preflight.
    async assertCanWrite(userId: string, id: string): Promise<void> {
      await repo.inRoom(id, userId, async ({ room, member }) => {
        assertCommunityWrite(room, member);
      });
    },
    async feed(id: string, query: CommunityFeedQuery): Promise<CommunityFeedResponse> {
      if (!(await repo.findById(id))) throw appError("KOMUNITAS_TIDAK_DITEMUKAN");
      const { page, meta } = communityPage(
        await repo.feed(id, query.limit, communityCursor(query.cursor), query.query),
        query.limit,
      );
      return {
        data: page.map((p) => ({
          id: p.id,
          communityId: p.communityId,
          body: p.body,
          status: p.status,
          author:
            p.authorId && p.fullName !== null ? { id: p.authorId, fullName: p.fullName } : null,
          commentCount: p.commentCount,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        meta,
      };
    },
    async create(actor: CommunityActor, input: CreateCommunity): Promise<Community> {
      const row = await uniqueSlug(() => repo.create(uuidV7(), actor.userId, input));
      audit(actor, row.id, "create");
      return roomResponse(row);
    },
    async update(actor: CommunityActor, id: string, input: UpdateCommunity): Promise<Community> {
      const row = await uniqueSlug(() =>
        repo.inRoom(id, actor.userId, async ({ room, role, update }) => {
          if (role !== "admin") throw appError("TIDAK_BERHAK");
          // Validate the merged state so a partial city/type patch cannot bypass its invariant.
          createCommunitySchema.parse({
            slug: input.slug ?? room.slug,
            name: input.name ?? room.name,
            description: input.description ?? room.description,
            type: input.type ?? room.type,
            city: input.city === undefined ? room.city : input.city,
          });
          return update(input);
        }),
      );
      audit(actor, id, input.status === "archived" ? "close" : "update");
      return roomResponse(row);
    },
  };
}
export type CommunityService = ReturnType<typeof createCommunityService>;
