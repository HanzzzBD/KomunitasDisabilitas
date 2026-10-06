import { Prisma } from "@prisma/client";
import type { CommunityListQuery, CreateCommunity, UpdateCommunity } from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";
import { appError } from "../../../core/http/index.js";
import type { PosisiKursor } from "../../../core/pagination/index.js";

const ROOM = {
  id: true,
  slug: true,
  name: true,
  description: true,
  type: true,
  city: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CommunitySelect;
const MEMBER = { communityId: true, status: true, joinedAt: true } as const;
type RoomFields = Prisma.CommunityGetPayload<{ select: typeof ROOM }>;
export type RoomRow = RoomFields & { _count: { memberships: number } };
export type MemberRow = Prisma.CommunityMembershipGetPayload<{ select: typeof MEMBER }>;
export interface FeedRow {
  id: string;
  communityId: string;
  body: string;
  status: "published";
  createdAt: Date;
  updatedAt: Date;
  authorId: string | null;
  fullName: string | null;
  commentCount: number;
}

/** Mutations serialize on the room. Leave never deletes a blocked marker. */
export function createCommunityRepository(prisma: AppPrisma) {
  async function withMemberCount(
    db: Pick<AppPrisma, "$queryRaw">,
    room: RoomFields,
  ): Promise<RoomRow> {
    // Nested relation reads bypass the global user soft-delete extension.
    // This aggregate explicitly excludes inactive users and returns no identity.
    const [row] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count
      FROM community_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.community_id = ${room.id}::uuid AND m.status = 'active'
        AND u.deleted_at IS NULL AND u.suspended_at IS NULL`;
    return { ...room, _count: { memberships: row!.count } };
  }
  async function inRoom<T>(
    id: string,
    userId: string,
    work: (ctx: {
      room: RoomRow;
      member: MemberRow | null;
      role: string;
      db: Prisma.TransactionClient;
      update(patch: UpdateCommunity): Promise<RoomRow>;
      join(): Promise<MemberRow>;
      leave(): Promise<void>;
    }) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      // Account suspension/deletion cannot overtake an authorized mutation.
      const users = await tx.$queryRaw<{ role: string }[]>`
        SELECT role::text FROM users WHERE id = ${userId}::uuid
          AND deleted_at IS NULL AND suspended_at IS NULL FOR SHARE`;
      if (!users[0]) throw appError("SESI_TIDAK_VALID");
      await tx.$queryRaw`SELECT id FROM communities WHERE id = ${id}::uuid FOR UPDATE`;
      const fields = await tx.community.findUnique({ where: { id }, select: ROOM });
      if (!fields) throw appError("KOMUNITAS_TIDAK_DITEMUKAN");
      const room = await withMemberCount(tx, fields);
      const where = { communityId_userId: { communityId: id, userId } };
      const member = await tx.communityMembership.findUnique({ where, select: MEMBER });
      return work({
        room,
        member,
        role: users[0].role,
        db: tx,
        update: async (data) =>
          withMemberCount(tx, await tx.community.update({ where: { id }, data, select: ROOM })),
        join: () =>
          tx.communityMembership.create({ data: { communityId: id, userId }, select: MEMBER }),
        async leave() {
          await tx.communityMembership.deleteMany({
            where: { communityId: id, userId, status: "active" },
          });
        },
      });
    });
  }
  return {
    inRoom,
    async list(
      query: CommunityListQuery,
      cursor: PosisiKursor | undefined,
      admin = false,
    ): Promise<RoomRow[]> {
      const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
      if (!admin) conditions.push(Prisma.sql`r.status = 'active'`);
      if (query.type) conditions.push(Prisma.sql`r.type::text = ${query.type}`);
      if (query.city) conditions.push(Prisma.sql`lower(r.city) = lower(${query.city})`);
      // Keep the actual microsecond timestamp even when the anchor was archived
      // between pages. OFFSET/skip would discard the next authorized row then.
      if (cursor)
        conditions.push(Prisma.sql`(r.created_at, r.id) < (
        COALESCE((SELECT created_at FROM communities WHERE id = ${cursor.id}::uuid), ${cursor.sortAt}), ${cursor.id}::uuid)`);
      const rows = await prisma.$queryRaw<(Omit<RoomRow, "_count"> & { memberCount: number })[]>`
        SELECT r.id, r.slug, r.name, r.description, r.type::text AS type, r.city, r.status::text AS status,
          r.created_at AS "createdAt", r.updated_at AS "updatedAt",
          (SELECT count(*)::int FROM community_memberships m JOIN users u ON u.id = m.user_id
            WHERE m.community_id = r.id AND m.status = 'active' AND u.deleted_at IS NULL AND u.suspended_at IS NULL) AS "memberCount"
        FROM communities r WHERE ${Prisma.join(conditions, " AND ")}
        ORDER BY r.created_at DESC, r.id DESC LIMIT ${query.limit + 1}`;
      return rows.map(({ memberCount, ...row }) => ({
        ...row,
        _count: { memberships: memberCount },
      }));
    },
    async findBySlug(slug: string) {
      const row = await prisma.community.findUnique({ where: { slug }, select: ROOM });
      return row ? withMemberCount(prisma, row) : null;
    },
    async findById(id: string) {
      const row = await prisma.community.findUnique({ where: { id }, select: ROOM });
      return row ? withMemberCount(prisma, row) : null;
    },
    findMember: (communityId: string, userId: string) =>
      prisma.communityMembership.findUnique({
        where: { communityId_userId: { communityId, userId } },
        select: MEMBER,
      }),
    create: (id: string, createdBy: string, input: CreateCommunity) =>
      prisma.$transaction(async (tx) => {
        const users = await tx.$queryRaw<{ role: string }[]>`SELECT role::text FROM users
        WHERE id = ${createdBy}::uuid AND deleted_at IS NULL AND suspended_at IS NULL FOR SHARE`;
        if (!users[0]) throw appError("SESI_TIDAK_VALID");
        if (users[0].role !== "admin") throw appError("TIDAK_BERHAK");
        return withMemberCount(
          tx,
          await tx.community.create({
            data: { id, ...input, city: input.city ?? null, createdBy },
            select: ROOM,
          }),
        );
      }),
    async feed(
      communityId: string,
      limit: number,
      cursor?: PosisiKursor,
      query?: string,
    ): Promise<FeedRow[]> {
      const conditions = [
        Prisma.sql`p.community_id = ${communityId}::uuid`,
        Prisma.sql`p.status = 'published'`,
      ];
      if (cursor)
        conditions.push(Prisma.sql`(p.created_at, p.id) < (
        COALESCE((SELECT created_at FROM community_posts WHERE id = ${cursor.id}::uuid
          AND community_id = ${communityId}::uuid), ${cursor.sortAt}), ${cursor.id}::uuid)`);
      if (query)
        conditions.push(
          Prisma.sql`to_tsvector('indonesian', p.body) @@ plainto_tsquery('indonesian', ${query})`,
        );
      return prisma.$queryRaw<FeedRow[]>`
        SELECT p.id, p.community_id AS "communityId", p.body, p.status::text AS status,
          p.created_at AS "createdAt", p.updated_at AS "updatedAt", u.id AS "authorId", u.full_name AS "fullName",
          (SELECT count(*)::int FROM community_comments c WHERE c.post_id = p.id AND c.status = 'published') AS "commentCount"
        FROM community_posts p LEFT JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL
        WHERE ${Prisma.join(conditions, " AND ")}
        ORDER BY p.created_at DESC, p.id DESC LIMIT ${limit + 1}`;
    },
    exportMemberships: (userId: string) =>
      prisma.communityMembership.findMany({
        where: { userId },
        select: MEMBER,
        orderBy: [{ joinedAt: "asc" }, { communityId: "asc" }],
      }),
  };
}
export type CommunityRepository = ReturnType<typeof createCommunityRepository>;
