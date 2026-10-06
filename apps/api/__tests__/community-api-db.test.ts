// PR-114: actual Express/RS256/Prisma against an isolated PostgreSQL schema.
// The application database and its users are never reset or edited.
import { readFileSync } from "node:fs";
import { Writable } from "node:stream";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  communityResponseSchema,
  communityListResponseSchema,
  communityFeedResponseSchema,
  communityMembershipResponseSchema,
  dataExportSchema,
  type UserRole,
} from "@nawasena/schemas";
import { uuidV7 } from "../src/core/ids/index.js";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { createCommunityModule } from "../src/modules/community/index.js";
import { createCommunityService } from "../src/modules/community/services/community.service.js";
import { createCommunityRepository } from "../src/modules/community/repositories/community.repository.js";
import { createCommunityMembershipExport } from "../src/modules/community/services/membership-export.service.js";
import { encodeKursor } from "../src/core/pagination/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { busUji } from "./helpers/events.js";

const databaseUrl = process.env.COMMUNITY_API_DATABASE_URL ?? process.env.DATABASE_URL;
const schema = `pr114_${uuidV7().replaceAll("-", "")}`;
const sql = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
const datasource = new URL(databaseUrl ?? "postgresql://nawasena:nawasena@localhost:5433/nawasena");
datasource.searchParams.set("schema", schema);
const prisma = new PrismaClient({ datasourceUrl: datasource.toString() });
const tokens = createTokenService(SESSION_KEYS);
const admin = uuidV7(),
  seeker = uuidV7(),
  other = uuidV7(),
  employer = uuidV7(),
  blockedAccount = uuidV7();
const roles: Record<string, UserRole> = {
  [admin]: "admin",
  [seeker]: "seeker",
  [other]: "seeker",
  [employer]: "employer",
  [blockedAccount]: "seeker",
};
const events = busUji();
const joined: unknown[] = [];
const audits: {
  actor: unknown;
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
}[] = [];
const auditLog = (
  actor: unknown,
  action: string,
  entity: string,
  entityId: string | null,
  meta: unknown,
) => {
  audits.push({ actor, action, entity, entityId, meta });
};
const counts = new Map<string, number>();
const redis = {
  async eval(_script: string, _keys: number, key: string) {
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return [count, 60_000];
  },
};
const repo = createCommunityRepository(prisma);
const service = createCommunityService({
  repository: repo,
  events,
  auditLog,
  rate: { bump: async () => ({ value: 1, retryAfterSeconds: 60 }) },
});
let available = false,
  created = false;
let base = "";
let server: ApiServer | undefined;

beforeAll(async () => {
  if (!databaseUrl) return;
  try {
    await sql.connect();
  } catch (error) {
    if (process.env.CI || process.env.COMMUNITY_API_DATABASE_URL) throw error;
    return;
  }
  await sql.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await sql.query(`SET search_path TO "${schema}", public`);
  await sql.query(`CREATE TABLE users (id UUID PRIMARY KEY, full_name TEXT NOT NULL, role TEXT NOT NULL,
    deleted_at TIMESTAMPTZ, suspended_at TIMESTAMPTZ)`);
  for (const [id, role] of Object.entries(roles)) {
    await sql.query(
      "INSERT INTO users(id, full_name, role, suspended_at) VALUES ($1, $2, $3, $4)",
      [id, "Pengguna Uji Fiktif", role, id === blockedAccount ? new Date() : null],
    );
  }
  await sql.query(
    readFileSync(
      new URL("../prisma/migrations/20261006090000_24_community/migration.sql", import.meta.url),
      "utf8",
    ),
  );
  const env = loadEnv({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "0",
    DATABASE_URL: datasource.toString(),
    REDIS_URL: "redis://localhost:9",
    REDIS_QUEUE_URL: "redis://localhost:9",
  });
  const logger = createLogger(env, {
    destination: new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    }),
  });
  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: async (id) => {
      const rows = await sql.query(
        "SELECT id, role FROM users WHERE id=$1 AND deleted_at IS NULL AND suspended_at IS NULL",
        [id],
      );
      return rows.rows[0] ? { ...rows.rows[0], tokenVersion: 0 } : null;
    },
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  server = createServer(env, logger, {
    routes(app) {
      app.use(
        createCommunityModule({
          prisma,
          redis,
          routes: registry.forModule("/api/v1"),
          events,
          auditLog,
        }).router,
      );
    },
  });
  assertRoutesDeclared(server.app, registry);
  events.on("community.member_joined", (event) => {
    joined.push(event);
  });
  base = `http://127.0.0.1:${(await server.start()).port}/api/v1`;
  available = true;
});
afterAll(async () => {
  await server?.stop();
  await prisma.$disconnect();
  if (created) {
    if (!/^pr114_[a-f0-9]{32}$/.test(schema)) throw new Error("Schema test tidak valid");
    await sql.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
  await sql.end();
});
async function call(path: string, userId?: string, method = "GET", body?: unknown) {
  const token = userId
    ? await tokens.signAccessToken({ sub: userId, role: roles[userId]!, ver: 0 })
    : undefined;
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function room(type: "topic" | "city" = "topic", city: string | null = null) {
  return prisma.community.create({
    data: {
      id: uuidV7(),
      slug: `ruang-${uuidV7()}`,
      name: "Ruang Uji",
      description: "Diskusi karier",
      type,
      city,
    },
  });
}
const actor = (userId: string) => ({ userId, requestId: uuidV7() });

describe("PR-114 Community: HTTP + DB", () => {
  it("admin create/update/archive only; guests, seekers and employers have no privilege", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    const input = {
      slug: `karier-${uuidV7()}`,
      name: "Karier",
      description: "Diskusi",
      type: "topic",
    };
    for (const userId of [undefined, seeker, employer]) {
      for (const [method, path, body] of [
        ["POST", "/admin/communities", input],
        ["PATCH", `/admin/communities/${r.id}`, { name: "Hacked" }],
        ["DELETE", `/admin/communities/${r.id}`, undefined],
        ["GET", "/admin/communities", undefined],
        ["GET", `/admin/communities/${r.id}`, undefined],
      ] as const) {
        expect((await call(path, userId, method, body)).status).toBe(userId ? 403 : 401);
      }
    }
    const createdRes = await call("/admin/communities", admin, "POST", input);
    expect(createdRes.status).toBe(201);
    const data = communityResponseSchema.parse(await createdRes.json()).data;
    expect(data).toMatchObject({ status: "active", memberCount: 0, membershipStatus: null });
    expect(data).not.toHaveProperty("createdBy");
    const audit = audits.find((a) => a.entityId === data.id)!;
    expect(audit).toMatchObject({
      action: "ADMIN_RESOURCE_CHANGED",
      entity: "community.room",
      meta: { operation: "create" },
    });
    const duplicate = await call("/admin/communities", admin, "POST", input);
    expect(duplicate.status).toBe(409);
    const update = await call(`/admin/communities/${data.id}`, admin, "PATCH", { name: "Baru" });
    expect(communityResponseSchema.parse(await update.json()).data.name).toBe("Baru");
    const archived = await call(`/admin/communities/${data.id}`, admin, "DELETE");
    expect(communityResponseSchema.parse(await archived.json()).data.status).toBe("archived");
    expect(await prisma.community.findUnique({ where: { id: data.id } })).not.toBeNull();
    expect(
      audits.some(
        (a) => a.entityId === data.id && (a.meta as { operation: string }).operation === "close",
      ),
    ).toBe(true);
  });

  it("patch validates the final type/city state and strict input rejects privilege fields", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room("city", "Bandung");
    for (const patch of [
      { city: null },
      { type: "topic" },
      { createdBy: other },
      {},
      { memberCount: 20 },
    ]) {
      expect((await call(`/admin/communities/${r.id}`, admin, "PATCH", patch)).status).toBe(400);
    }
    const result = await call(`/admin/communities/${r.id}`, admin, "PATCH", {
      type: "topic",
      city: null,
    });
    expect(communityResponseSchema.parse(await result.json()).data).toMatchObject({
      type: "topic",
      city: null,
    });
    expect(
      (
        await call("/admin/communities", admin, "POST", {
          slug: "test",
          name: "A",
          description: "B",
          type: "city",
        })
      ).status,
    ).toBe(400);
  });

  it("public discovery is filtered/paginated, contains no member identities, and archive detail remains readable", async (ctx) => {
    if (!available) return ctx.skip();
    const city = `Kota-${uuidV7()}`;
    const a = await room("city", city),
      b = await room("city", city),
      c = await room("city", city);
    const at = new Date("2026-10-06T00:00:00Z");
    await prisma.community.updateMany({
      where: { id: { in: [a.id, b.id, c.id] } },
      data: { createdAt: at },
    });
    await sql.query(
      "UPDATE communities SET created_at = created_at + INTERVAL '0.000123 seconds' WHERE id = ANY($1::uuid[])",
      [[a.id, b.id, c.id]],
    );
    const path = `/communities?type=city&city=${city}&limit=2`;
    const p1 = communityListResponseSchema.parse(await (await call(path)).json());
    expect(p1.data).toHaveLength(2);
    expect(p1.meta.nextCursor).not.toBeNull();
    await service.update(actor(admin), p1.data[1]!.id, { status: "archived" });
    const p2 = communityListResponseSchema.parse(
      await (await call(`${path}&cursor=${encodeURIComponent(p1.meta.nextCursor!)}`)).json(),
    );
    expect(p2.data).toHaveLength(1);
    expect(p2.meta.nextCursor).toBeNull();
    expect(new Set([...p1.data, ...p2.data].map((v) => v.id)).size).toBe(3);
    expect(p1.data.every((v) => v.membershipStatus === null)).toBe(true);
    await service.update(actor(admin), a.id, { status: "archived" });
    expect(
      communityResponseSchema.parse(await (await call(`/communities/${a.slug}`)).json()).data
        .status,
    ).toBe("archived");
    const after = communityListResponseSchema.parse(
      await (await call(`/communities?type=city&city=${city}`)).json(),
    );
    expect(after.data.map((v) => v.id)).not.toContain(a.id);
    const adminAfter = communityListResponseSchema.parse(
      await (await call(`/admin/communities?city=${city}`, admin)).json(),
    );
    expect(adminAfter.data.map((v) => v.id)).toContain(a.id);
  });

  it("concurrent/repeated join creates one row, stable joinedAt, and one event; leave is idempotent", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    const before = joined.length;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call(`/communities/${r.id}/join`, seeker, "POST")),
    );
    expect(results.every((res) => res.status === 200)).toBe(true);
    const members = await Promise.all(
      results.map(async (res) => communityMembershipResponseSchema.parse(await res.json()).data!),
    );
    expect(new Set(members.map((m) => m.joinedAt)).size).toBe(1);
    expect(await prisma.communityMembership.count({ where: { communityId: r.id } })).toBe(1);
    expect(joined.slice(before)).toEqual([
      { communityId: r.id, userId: seeker, joinedAt: members[0]!.joinedAt },
    ]);
    for (let i = 0; i < 2; i++) {
      const res = await call(`/communities/${r.id}/membership`, seeker, "DELETE");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: null });
    }
    expect(await prisma.communityMembership.count({ where: { communityId: r.id } })).toBe(0);
  });

  it("membership always belongs to caller; arbitrary userId is rejected", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    await service.join(actor(other), r.id);
    expect(await (await call(`/communities/${r.id}/membership`, seeker)).json()).toEqual({
      data: null,
    });
    expect(
      (await call(`/communities/${r.id}/join`, seeker, "POST", { userId: other })).status,
    ).toBe(400);
    expect(
      (await call(`/communities/${r.id}/membership`, seeker, "DELETE", { userId: other })).status,
    ).toBe(400);
    await call(`/communities/${r.id}/membership`, seeker, "DELETE");
    expect(
      await prisma.communityMembership.findUnique({
        where: { communityId_userId: { communityId: r.id, userId: other } },
      }),
    ).not.toBeNull();
  });

  it("blocked markers cannot be cleared through leave/join; writing needs active membership for every role", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    await prisma.communityMembership.create({
      data: { communityId: r.id, userId: seeker, status: "blocked" },
    });
    expect((await call(`/communities/${r.id}/join`, seeker, "POST")).status).toBe(403);
    expect((await call(`/communities/${r.id}/membership`, seeker, "DELETE")).status).toBe(403);
    expect(
      communityMembershipResponseSchema.parse(
        await (await call(`/communities/${r.id}/membership`, seeker)).json(),
      ).data?.status,
    ).toBe("blocked");
    await expect(service.assertCanWrite(seeker, r.id)).rejects.toMatchObject({
      code: "KEANGGOTAAN_DIBLOKIR",
    });
    for (const userId of [other, admin, employer]) {
      await expect(service.assertCanWrite(userId, r.id)).rejects.toMatchObject({
        code: "BUKAN_ANGGOTA_KOMUNITAS",
      });
      await service.join(actor(userId), r.id);
      await expect(service.assertCanWrite(userId, r.id)).resolves.toBeUndefined();
    }
    await prisma.communityMembership.create({
      data: { communityId: r.id, userId: blockedAccount },
    });
    expect(
      communityResponseSchema.parse(await (await call(`/communities/${r.slug}`)).json()).data
        .memberCount,
    ).toBe(3);
  });

  it("archiving closes join/write but keeps old feed and permits active members to leave", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    await service.join(actor(seeker), r.id);
    await prisma.communityPost.create({
      data: { id: uuidV7(), communityId: r.id, authorId: seeker, body: "Diskusi lama" },
    });
    await call(`/admin/communities/${r.id}`, admin, "DELETE");
    for (const userId of [seeker, other])
      expect((await call(`/communities/${r.id}/join`, userId, "POST")).status).toBe(409);
    await expect(service.assertCanWrite(seeker, r.id)).rejects.toMatchObject({
      code: "KOMUNITAS_DIARSIPKAN",
    });
    const feed = communityFeedResponseSchema.parse(
      await (await call(`/communities/${r.id}/posts`, other)).json(),
    );
    expect(feed.data.map((p) => p.body)).toEqual(["Diskusi lama"]);
    expect((await call(`/communities/${r.id}/membership`, seeker, "DELETE")).status).toBe(200);
    expect(await prisma.communityPost.count({ where: { communityId: r.id } })).toBe(1);
  });

  it("feed needs valid login but no join; filters room/status/search and uses stable cursor", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room(),
      foreign = await room();
    const at = new Date("2026-10-06T01:00:00Z");
    const ids = [uuidV7(), uuidV7(), uuidV7()];
    for (const id of ids)
      await prisma.communityPost.create({
        data: { id, communityId: r.id, body: "peluang kerja", authorId: seeker, createdAt: at },
      });
    await sql.query(
      "UPDATE community_posts SET created_at = created_at + INTERVAL '0.000123 seconds' WHERE community_id = $1",
      [r.id],
    );
    for (const status of ["hidden", "removed"] as const)
      await prisma.communityPost.create({
        data: { id: uuidV7(), communityId: r.id, body: "rahasia kerja", status },
      });
    await prisma.communityPost.create({
      data: { id: uuidV7(), communityId: foreign.id, body: "kerja ruang lain" },
    });
    await prisma.communityComment.create({
      data: { id: uuidV7(), postId: [...ids].sort().at(-1)!, body: "Terima kasih" },
    });
    await prisma.communityComment.create({
      data: {
        id: uuidV7(),
        postId: [...ids].sort().at(-1)!,
        body: "Tersembunyi",
        status: "hidden",
      },
    });
    expect((await call(`/communities/${r.id}/posts`)).status).toBe(401);
    expect((await call(`/communities/${r.id}/posts`, blockedAccount)).status).toBe(401);
    const path = `/communities/${r.id}/posts?query=kerja&limit=2`;
    const p1 = communityFeedResponseSchema.parse(await (await call(path, employer)).json());
    await prisma.communityPost.update({
      where: { id: p1.data[1]!.id },
      data: { status: "hidden" },
    });
    const p2 = communityFeedResponseSchema.parse(
      await (
        await call(`${path}&cursor=${encodeURIComponent(p1.meta.nextCursor!)}`, employer)
      ).json(),
    );
    expect([...p1.data, ...p2.data].map((p) => p.id)).toEqual([...ids].sort().reverse());
    expect(p1.data[0]!.commentCount).toBe(1);
    expect(p1.data[0]!.author).toEqual({ id: seeker, fullName: "Pengguna Uji Fiktif" });
    expect(p2.meta.nextCursor).toBeNull();
    const adminFeed = communityFeedResponseSchema.parse(
      await (await call(`/communities/${r.id}/posts`, admin)).json(),
    );
    expect(adminFeed.data.every((p) => p.status === "published")).toBe(true);
    const wrongCursor = encodeKursor({ sortAt: new Date(), id: "not-uuid" });
    expect((await call(`/communities/${r.id}/posts?cursor=${wrongCursor}`, seeker)).status).toBe(
      400,
    );
    expect((await call(`/communities/${r.id}/posts?cursor=broken`, seeker)).status).toBe(400);
  });

  it("suspended/deleted accounts lose mutation access; deleted author identity is detached in feed", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    expect((await call(`/communities/${r.id}/join`, blockedAccount, "POST")).status).toBe(401);
    await expect(service.join(actor(blockedAccount), r.id)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
    const id = uuidV7();
    await sql.query(
      "INSERT INTO users(id, full_name, role, deleted_at) VALUES ($1, 'Terhapus', 'seeker', NOW())",
      [id],
    );
    await prisma.communityPost.create({
      data: { id: uuidV7(), communityId: r.id, authorId: id, body: "Riwayat" },
    });
    await prisma.communityMembership.create({ data: { communityId: r.id, userId: id } });
    expect(
      communityResponseSchema.parse(await (await call(`/communities/${r.slug}`)).json()).data
        .memberCount,
    ).toBe(0);
    await expect(service.join(actor(id), r.id)).rejects.toMatchObject({ code: "SESI_TIDAK_VALID" });
    expect(
      communityFeedResponseSchema.parse(
        await (await call(`/communities/${r.id}/posts`, seeker)).json(),
      ).data[0]!.author,
    ).toBeNull();
    for (const path of [
      `/communities/${uuidV7()}/join`,
      `/communities/${uuidV7()}/membership`,
      `/communities/${uuidV7()}/posts`,
    ]) {
      expect((await call(path, seeker, path.endsWith("join") ? "POST" : "GET")).status).toBe(404);
    }
  });

  it("PDP export includes all caller memberships, blocked/archived too, without other users", async (ctx) => {
    if (!available) return ctx.skip();
    const owner = uuidV7();
    await sql.query(
      "INSERT INTO users(id, full_name, role) VALUES ($1, 'Pemilik Uji Fiktif', 'employer')",
      [owner],
    );
    const a = await room(),
      b = await room();
    await prisma.communityMembership.create({
      data: { communityId: a.id, userId: owner, status: "blocked" },
    });
    await service.join(actor(other), b.id);
    await service.join(actor(owner), b.id);
    await service.update(actor(admin), b.id, { status: "archived" });
    const contributor = createCommunityMembershipExport(repo);
    const result = dataExportSchema.shape.communityMemberships.parse(
      await contributor.kumpulkan(owner),
    );
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.communityId).sort()).toEqual([a.id, b.id].sort());
    expect(result.find((m) => m.communityId === a.id)!.status).toBe("blocked");
    expect(result.every((m) => !Object.hasOwn(m, "userId"))).toBe(true);
  });

  it("read/write limits are independent, per caller across rooms, and return Retry-After", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    counts.set(`community:rate:write:${other}`, 20);
    const limitedWrite = await call(`/communities/${r.id}/join`, other, "POST");
    expect(limitedWrite.status).toBe(429);
    expect(limitedWrite.headers.get("retry-after")).toBe("60");
    expect(await limitedWrite.json()).toMatchObject({ code: "TERLALU_BANYAK_PERMINTAAN" });
    expect((await call(`/communities/${r.id}/membership`, other)).status).toBe(200);
    counts.set(`community:rate:read:${other}`, 120);
    const limitedRead = await call(`/communities/${r.id}/posts`, other);
    expect(limitedRead.status).toBe(429);
    expect(limitedRead.headers.get("retry-after")).toBe("60");
    expect((await call(`/communities/${r.id}/posts`, employer)).status).toBe(200);
  });
});
