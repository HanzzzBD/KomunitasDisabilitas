// HTTP + real transactions in an isolated schema, never application user data.
import { readFileSync } from "node:fs";
import { Writable } from "node:stream";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import {
  communityPostResponseSchema,
  communityCommentResponseSchema,
  communityCommentListResponseSchema,
  communityContentResponseSchema,
  communityReportResponseSchema,
  communityReportAdminResponseSchema,
  communityReportAdminListResponseSchema,
  communityQueueResponseSchema,
  communityQueueDetailResponseSchema,
  communityMetricsResponseSchema,
  communityListResponseSchema,
  communityFeedResponseSchema,
  dataExportSchema,
  AUDIT_ACTION,
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
import { createCommunityAdminRepository } from "../src/modules/community/repositories/admin.repository.js";
import { createNotificationsModule } from "../src/modules/notifications/index.js";
import { encodeKursor } from "../src/core/pagination/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { busUji } from "./helpers/events.js";

const databaseUrl = process.env.COMMUNITY_API_DATABASE_URL ?? process.env.DATABASE_URL;
const schema = `pr116_${uuidV7().replaceAll("-", "")}`;
const sql = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
const datasource = new URL(databaseUrl ?? "postgresql://nawasena:nawasena@localhost:5433/nawasena");
datasource.searchParams.set("schema", schema);
const prisma = new PrismaClient({ datasourceUrl: datasource.toString() });
const tokens = createTokenService(SESSION_KEYS);
const admin = uuidV7(),
  author = uuidV7(),
  other = uuidV7(),
  employer = uuidV7(),
  suspended = uuidV7();
const roles: Record<string, UserRole> = {
  [admin]: "admin",
  [author]: "seeker",
  [other]: "seeker",
  [employer]: "employer",
  [suspended]: "seeker",
};
const events = busUji();
const reported: unknown[] = [],
  moderated: unknown[] = [];
events.on("community.content_reported", (e) => {
  reported.push(e);
});
events.on("community.content_moderated", (e) => {
  moderated.push(e);
});
const counts = new Map<string, number>();
const redis = {
  async eval(_script: string, _n: number, key: string) {
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return [n, 60_000];
  },
};
let available = false,
  created = false,
  base = "";
let server: ApiServer | undefined;
let module: ReturnType<typeof createCommunityModule>;
beforeAll(async () => {
  if (!databaseUrl) return;
  try {
    await sql.connect();
  } catch (e) {
    if (process.env.CI || process.env.COMMUNITY_API_DATABASE_URL) throw e;
    return;
  }
  await sql.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await sql.query(`SET search_path TO "${schema}", public`);
  await sql.query(
    `CREATE TABLE users (id UUID PRIMARY KEY, full_name TEXT NOT NULL, role TEXT NOT NULL, deleted_at TIMESTAMPTZ, suspended_at TIMESTAMPTZ)`,
  );
  for (const [id, role] of Object.entries(roles))
    await sql.query("INSERT INTO users(id,full_name,role,suspended_at) VALUES($1,$2,$3,$4)", [
      id,
      "Pengguna Fiktif",
      role,
      id === suspended ? new Date() : null,
    ]);
  await sql.query(
    readFileSync(
      new URL("../prisma/migrations/20261006090000_24_community/migration.sql", import.meta.url),
      "utf8",
    ),
  );
  await sql.query(`CREATE TABLE audit_logs (id UUID PRIMARY KEY, actor_id UUID, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id UUID, meta JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE notifications (id UUID PRIMARY KEY,user_id UUID REFERENCES users(id),type TEXT NOT NULL,payload JSONB NOT NULL DEFAULT '{}',read_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
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
      write(_c, _e, cb) {
        cb();
      },
    }),
  });
  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: async (id) => {
      const r = await sql.query(
        "SELECT id,role FROM users WHERE id=$1 AND deleted_at IS NULL AND suspended_at IS NULL",
        [id],
      );
      return r.rows[0] ? { ...r.rows[0], tokenVersion: 0 } : null;
    },
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  server = createServer(env, logger, {
    routes(app) {
      module = createCommunityModule({
        prisma,
        redis,
        routes: registry.forModule("/api/v1"),
        events,
        auditLog: () => {},
        contentPolicy: {
          postMaxLength: 40,
          commentMaxLength: 20,
          createMax: 6,
          reportMax: 6,
          windowMs: 60_000,
        },
      });
      app.use(module.router);
      app.use(
        createNotificationsModule({
          prisma,
          events,
          routes: registry.forModule("/api/v1"),
          direktoriAdmin: { idAdminAktif: async () => [admin] },
        }).router,
      );
    },
  });
  assertRoutesDeclared(server.app, registry);
  base = `http://127.0.0.1:${(await server.start()).port}/api/v1`;
  available = true;
}, 15_000);
beforeEach(() => {
  counts.clear();
  reported.length = 0;
  moderated.length = 0;
});
afterAll(async () => {
  await server?.stop();
  await prisma.$disconnect();
  if (created) {
    if (!/^pr116_[a-f0-9]{32}$/.test(schema)) throw new Error("Schema test tidak valid");
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
async function room(members = [author]) {
  const r = await prisma.community.create({
    data: {
      id: uuidV7(),
      slug: `ruang-${uuidV7()}`,
      name: "Ruang Fiktif",
      description: "Diskusi karier",
      type: "topic",
    },
  });
  for (const userId of members)
    await prisma.communityMembership.create({ data: { communityId: r.id, userId } });
  return r;
}
async function post(communityId: string, userId = author, body = "Diskusi karier") {
  return prisma.communityPost.create({
    data: { id: uuidV7(), communityId, authorId: userId, body },
  });
}
async function comment(postId: string, userId = author) {
  return prisma.communityComment.create({
    data: { id: uuidV7(), postId, authorId: userId, body: "Balasan fiktif" },
  });
}
describe("PR-118 Community admin", () => {
  it("minimal queue/detail/metrics reject guests, seekers, employers and suspended accounts", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    const p = await post(r.id);
    const report = await prisma.communityReport.create({
      data: {
        id: uuidV7(),
        reporterId: other,
        targetType: "post",
        targetId: p.id,
        reason: "Rujukan",
      },
    });
    for (const path of [
      "/admin/community-queue",
      `/admin/community-queue/${report.id}`,
      "/admin/community-metrics",
    ])
      for (const [id, expected] of [
        [undefined, 401],
        [author, 403],
        [employer, 403],
        [suspended, 401],
      ] as const)
        expect((await call(path, id)).status).toBe(expected);
    const response = await call(`/admin/community-queue/${report.id}`, admin);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const payload = communityQueueDetailResponseSchema.parse(await response.json());
    expect(payload.data.reason).toBe("Rujukan");
    for (const key of ["reporterId", "resolvedBy", "profile", "resume", "email", "phone"])
      expect(JSON.stringify(payload)).not.toContain(key);
    expect((await call(`/admin/community-queue/${uuidV7()}`, admin)).status).toBe(404);
    expect((await call("/admin/community-queue/invalid", admin)).status).toBe(400);
    communityMetricsResponseSchema.parse(
      await (await call("/admin/community-metrics", admin)).json(),
    );
  });
  it("minimal queue keeps microsecond oldest-first pagination when the anchor is closed", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    const p = await post(r.id);
    const ids = [uuidV7(), uuidV7(), uuidV7()];
    for (const [index, id] of ids.entries())
      await sql.query(
        "INSERT INTO community_reports(id,reporter_id,target_type,target_id,reason,created_at) VALUES($1,$2,'post',$3,'Aturan',$4)",
        [id, other, p.id, `1990-01-01T00:00:00.00000${index + 1}Z`],
      );
    const page = communityQueueResponseSchema.parse(
      await (await call("/admin/community-queue?limit=2&status=open", admin)).json(),
    );
    expect(page.data.map((row) => row.id)).toEqual(ids.slice(0, 2));
    await prisma.communityReport.update({
      where: { id: ids[1] },
      data: { status: "resolved", resolvedBy: admin, resolvedAt: new Date() },
    });
    const next = communityQueueResponseSchema.parse(
      await (
        await call(
          `/admin/community-queue?limit=2&status=open&cursor=${encodeURIComponent(page.meta.nextCursor!)}`,
          admin,
        )
      ).json(),
    );
    expect(next.data[0]!.id).toBe(ids[2]);
    expect(next.data.every((row) => row.status === "open")).toBe(true);
    expect((await call("/admin/community-queue?cursor=bad", admin)).status).toBe(400);
    await prisma.communityReport.updateMany({
      where: { id: { in: ids } },
      data: { status: "resolved", resolvedBy: admin, resolvedAt: new Date() },
    });
  });
  it("minimal rejection enforces reason, commits audit and preserves the content", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    const p = await post(r.id);
    const row = await prisma.communityReport.create({
      data: {
        id: uuidV7(),
        reporterId: other,
        targetType: "post",
        targetId: p.id,
        reason: "Laporan",
      },
    });
    const path = `/admin/community-queue/${row.id}/reject`;
    expect((await call(path, author, "POST", { reason: "Keputusan" })).status).toBe(403);
    expect((await call(path, admin, "POST", { reason: "  " })).status).toBe(400);
    const rejected = communityQueueDetailResponseSchema.parse(
      await (await call(path, admin, "POST", { reason: "Tidak melanggar aturan" })).json(),
    ).data;
    expect(rejected.status).toBe("rejected");
    expect(await prisma.communityPost.findUnique({ where: { id: p.id } })).toMatchObject({
      status: "published",
      body: p.body,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: row.id } });
    expect(audit).toMatchObject({ actorId: admin, action: AUDIT_ACTION.COMMUNITY_REPORT_REJECTED });
    expect(audit.meta).toMatchObject({ reason: "Tidak melanggar aturan" });
    expect(audit.createdAt).toBeInstanceOf(Date);
    expect((await call(path, admin, "POST", { reason: "Ulang" })).status).toBe(409);
  });
  it("minimal rejection rolls back if the audit insert fails", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    const p = await post(r.id);
    const row = await prisma.communityReport.create({
      data: {
        id: uuidV7(),
        reporterId: other,
        targetType: "post",
        targetId: p.id,
        reason: "Laporan",
      },
    });
    await sql.query(
      `CREATE FUNCTION reject_audit_118() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failure'; END $$; CREATE TRIGGER reject_audit_118 BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_118()`,
    );
    try {
      expect(
        (
          await call(`/admin/community-queue/${row.id}/reject`, admin, "POST", {
            reason: "Keputusan",
          })
        ).status,
      ).toBe(500);
      expect(await prisma.communityReport.findUnique({ where: { id: row.id } })).toMatchObject({
        status: "open",
        resolvedAt: null,
        resolvedBy: null,
      });
      expect(await prisma.auditLog.count({ where: { entityId: row.id } })).toBe(0);
    } finally {
      await sql.query(
        "DROP TRIGGER reject_audit_118 ON audit_logs; DROP FUNCTION reject_audit_118()",
      );
    }
  });
  it("metrics use a fixed 30-day window, include final content and both resolution outcomes, and return no identity", async (ctx) => {
    if (!available) return ctx.skip();
    const to = new Date("2035-06-30T12:00:00Z");
    const from = new Date(to.getTime() - 30 * 86_400_000);
    const r = await room([author, other, suspended]);
    await prisma.communityMembership.updateMany({
      where: { communityId: r.id },
      data: { joinedAt: from },
    });
    await prisma.communityMembership.update({
      where: { communityId_userId: { communityId: r.id, userId: other } },
      data: { status: "blocked" },
    });
    for (const [status, createdAt] of [
      ["published", from],
      ["removed", to],
      ["hidden", new Date(from.getTime() - 1)],
    ] as const)
      await prisma.communityPost.create({
        data: {
          id: uuidV7(),
          communityId: r.id,
          authorId: author,
          body: "Teks fiktif",
          status,
          createdAt,
        },
      });
    const p = await post(r.id);
    for (const [status, seconds] of [
      ["resolved", 3600],
      ["rejected", 10800],
    ] as const)
      await prisma.communityReport.create({
        data: {
          id: uuidV7(),
          reporterId: other,
          targetType: "post",
          targetId: p.id,
          reason: "Aturan",
          status,
          createdAt: new Date(to.getTime() - seconds * 1000),
          resolvedAt: to,
          resolvedBy: admin,
        },
      });
    const metrics = await createCommunityAdminRepository(prisma).metrics(to);
    expect(metrics).toMatchObject({
      periodDays: 30,
      from: from.toISOString(),
      to: to.toISOString(),
      newMemberships: 1,
      posts: 2,
      closedReports: 2,
      averageResolutionSeconds: 7200,
    });
    expect(metrics.openReports).toBe(
      await prisma.communityReport.count({ where: { status: "open" } }),
    );
    expect(JSON.stringify(metrics)).not.toContain(author);
    const empty = await createCommunityAdminRepository(prisma).metrics(new Date("2040-01-01Z"));
    expect(empty).toMatchObject({
      newMemberships: 0,
      posts: 0,
      closedReports: 0,
      averageResolutionSeconds: null,
    });
  });
  it("room status filters return only requested statuses without affecting public browsing", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    await prisma.community.update({ where: { id: r.id }, data: { status: "archived" } });
    const archived = communityListResponseSchema.parse(
      await (await call("/admin/communities?status=archived&limit=100", admin)).json(),
    );
    expect(archived.data.some((row: { id: string }) => row.id === r.id)).toBe(true);
    expect(archived.data.every((row: { status: string }) => row.status === "archived")).toBe(true);
    expect((await call("/communities?status=archived", undefined)).status).toBe(400);
  });
});

const actor = (userId: string) => ({ userId, requestId: uuidV7() });
async function contentData(response: Response) {
  return communityPostResponseSchema.or(communityCommentResponseSchema).parse(await response.json())
    .data;
}
const targetPath = (type: "post" | "comment", id: string) =>
  `/community-${type === "post" ? "posts" : "comments"}/${id}`;
const moderatePath = (type: string, id: string) =>
  `/admin/community-content/${type}/${id}/moderate`;

describe("PR-116 Community content: HTTP + DB", () => {
  for (const id of [author, employer, admin]) {
    it(`each role writes only as an active member: ${roles[id]}`, async (ctx) => {
      if (!available) return ctx.skip();
      const r = await room([]);
      expect((await call(`/communities/${r.id}/posts`, id, "POST", { body: "Teks" })).status).toBe(
        403,
      );
      await prisma.communityMembership.create({ data: { communityId: r.id, userId: id } });
      const result = await call(`/communities/${r.id}/posts`, id, "POST", {
        body: "  e\u0301\r\nKarier\u0007  ",
      });
      expect(result.status).toBe(201);
      const payload = communityPostResponseSchema.parse(await result.json());
      expect(payload.data.body).toBe("é\nKarier");
      expect(payload.data.author?.id).toBe(id);
      const c = await call(`/community-posts/${payload.data.id}/comments`, id, "POST", {
        body: "Balasan",
      });
      expect(c.status).toBe(201);
      expect(communityCommentResponseSchema.parse(await c.json()).data.postId).toBe(
        payload.data.id,
      );
    });
  }
  it("guest and suspended accounts cannot read or write content", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    for (const id of [undefined, suspended])
      for (const path of [targetPath("post", p.id), `/community-posts/${p.id}/comments`])
        expect((await call(path, id)).status).toBe(401);
    expect(
      (await call(`/communities/${p.communityId}/posts`, undefined, "POST", { body: "Teks" }))
        .status,
    ).toBe(401);
  });
  for (const type of ["post", "comment"] as const) {
    it(`${type}: owner edits, other users/admin cannot impersonate the owner`, async (ctx) => {
      if (!available) return ctx.skip();
      const p = await post((await room()).id);
      const row = type === "post" ? p : await comment(p.id);
      const path = targetPath(type, row.id);
      for (const id of [other, admin]) {
        expect((await call(path, id, "PATCH", { body: "Ganti" })).status).toBe(404);
        expect((await call(path, id, "DELETE")).status).toBe(404);
      }
      const edited = await call(path, author, "PATCH", { body: "Ganti sendiri" });
      expect(edited.status).toBe(200);
      expect((await contentData(edited)).body).toBe("Ganti sendiri");
    });
  }
  it("rejects empty/NUL/over-limit/extra fields and nested replies at the boundary", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    for (const body of ["  ", "\u0007", "A\u0000", "x".repeat(41)])
      expect(
        (await call(`/communities/${p.communityId}/posts`, author, "POST", { body })).status,
      ).toBe(400);
    expect(
      (
        await call(`/communities/${p.communityId}/posts`, author, "POST", {
          body: "Teks",
          authorId: other,
        })
      ).status,
    ).toBe(400);
    counts.clear();
    for (const body of [{ body: "x".repeat(21) }, { body: "Balas", parentCommentId: uuidV7() }])
      expect((await call(`/community-posts/${p.id}/comments`, author, "POST", body)).status).toBe(
        400,
      );
    expect((await call("/community-posts/not-a-uuid", author)).status).toBe(400);
  });
  it("literal markup is never interpreted and special query characters stay data", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    const response = await call(`/communities/${r.id}/posts`, author, "POST", {
      body: "<script>x</script> & 2 < 3",
    });
    expect(response.headers.get("content-type")).toContain("application/json");
    const p = communityPostResponseSchema.parse(await response.json()).data;
    expect(p.body).toBe("<script>x</script> & 2 < 3");
    expect(
      (await call(`/communities/${r.id}/posts?query=${encodeURIComponent("' OR 1=1 --")}`, other))
        .status,
    ).toBe(200);
  });
  it("archive/block stop creation and edit, but allow an owner to erase text", async (ctx) => {
    if (!available) return ctx.skip();
    for (const blocked of [false, true]) {
      const r = await room();
      const p = await post(r.id);
      if (blocked)
        await prisma.communityMembership.update({
          where: { communityId_userId: { communityId: r.id, userId: author } },
          data: { status: "blocked" },
        });
      else await prisma.community.update({ where: { id: r.id }, data: { status: "archived" } });
      const expected = blocked ? 403 : 409;
      expect(
        (await call(`/communities/${r.id}/posts`, author, "POST", { body: "Teks" })).status,
      ).toBe(expected);
      expect(
        (await call(targetPath("post", p.id), author, "PATCH", { body: "Ganti" })).status,
      ).toBe(expected);
      const removed = await call(targetPath("post", p.id), author, "DELETE");
      expect(removed.status).toBe(200);
      expect((await contentData(removed)).body).toBe("");
    }
  });
  for (const type of ["post", "comment"] as const) {
    it(`${type} hide/restore/remove enforce visibility, reason, audit and final removal`, async (ctx) => {
      if (!available) return ctx.skip();
      const p = await post((await room()).id);
      const row = type === "post" ? p : await comment(p.id);
      const path = targetPath(type, row.id),
        mod = moderatePath(type, row.id);
      for (const id of [undefined, author, employer])
        expect((await call(mod, id, "POST", { action: "hide", reason: "Aturan" })).status).toBe(
          id ? 403 : 401,
        );
      expect((await call(mod, admin, "POST", { action: "hide", reason: " " })).status).toBe(400);
      const hide = await call(mod, admin, "POST", { action: "hide", reason: "Aturan ruang" });
      expect(hide.status).toBe(200);
      expect(communityContentResponseSchema.parse(await hide.json()).data.content.status).toBe(
        "hidden",
      );
      expect((await call(path, other)).status).toBe(404);
      const own = await contentData(await call(path, author));
      expect(own.body).toBe(row.body);
      expect(own.moderation?.reason).toBe("Aturan ruang");
      expect(Object.keys(own.moderation!).sort()).toEqual(["action", "createdAt", "reason"]);
      const edited = await contentData(
        await call(path, author, "PATCH", { body: "Sudah diperbaiki" }),
      );
      expect(edited.status).toBe("hidden");
      expect(
        (await call(mod, admin, "POST", { action: "restore", reason: "Sesuai aturan" })).status,
      ).toBe(200);
      expect((await call(path, other)).status).toBe(200);
      expect(
        (await call(mod, admin, "POST", { action: "remove", reason: "Dihapus admin" })).status,
      ).toBe(200);
      const mine = await contentData(await call(path, author));
      expect(mine.body).toBe("");
      expect(mine.status).toBe("removed");
      const internal = communityContentResponseSchema.parse(
        await (await call(`/admin/community-content/${type}/${row.id}`, admin)).json(),
      ).data;
      expect(internal.content.body).toBe("Sudah diperbaiki");
      expect((await call(mod, admin, "POST", { action: "restore", reason: "Coba" })).status).toBe(
        409,
      );
      expect((await call(path, author, "PATCH", { body: "Ganti" })).status).toBe(409);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: row.id, action: AUDIT_ACTION.COMMUNITY_CONTENT_MODERATED },
      });
      expect(audits).toHaveLength(3);
      expect(audits.every((a) => a.actorId === admin && a.createdAt instanceof Date)).toBe(true);
    });
  }
  it("parent moderation hides the discussion and stops replies; other comments do not leak", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room([author, other]);
    const p = await post(r.id);
    const c = await comment(p.id, other);
    await call(moderatePath("post", p.id), admin, "POST", { action: "hide", reason: "Aturan" });
    expect((await call(`/community-posts/${p.id}/comments`, author)).status).toBe(404);
    expect((await call(targetPath("comment", c.id), author)).status).toBe(404);
    expect(
      (await call(`/community-posts/${p.id}/comments`, other, "POST", { body: "Balas" })).status,
    ).toBe(404);
    expect((await call(targetPath("comment", c.id), other)).status).toBe(200);
    const feed = communityFeedResponseSchema.parse(
      await (await call(`/communities/${r.id}/posts`, other)).json(),
    ).data;
    expect(feed).toEqual([]);
  });
  it("self delete is idempotent, clears DB text, and cannot be restored by admin", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    await prisma.communityMembership.deleteMany({
      where: { communityId: p.communityId, userId: author },
    });
    for (let n = 0; n < 2; n++)
      expect((await call(targetPath("post", p.id), author, "DELETE")).status).toBe(200);
    const stored = await prisma.communityPost.findUniqueOrThrow({ where: { id: p.id } });
    expect(stored.body).toBe("");
    expect(stored.status).toBe("removed");
    expect(
      (await call(moderatePath("post", p.id), admin, "POST", { action: "restore", reason: "Coba" }))
        .status,
    ).toBe(409);
  });
  it("reports are allowed for nonmembers, blocked members and archived rooms; duplicates do not disclose identity", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    const p = await post(r.id);
    await prisma.communityMembership.create({
      data: { communityId: r.id, userId: other, status: "blocked" },
    });
    await prisma.community.update({ where: { id: r.id }, data: { status: "archived" } });
    for (const id of [other, employer]) {
      const report = await call(`/community-content/post/${p.id}/reports`, id, "POST", {
        reason: "Perlu ditinjau",
      });
      expect(report.status).toBe(201);
      const receipt = communityReportResponseSchema.parse(await report.json());
      expect(Object.keys(receipt.data).sort()).toEqual([
        "createdAt",
        "id",
        "status",
        "targetId",
        "targetType",
      ]);
      const again = await call(`/community-content/post/${p.id}/reports`, id, "POST", {
        reason: "Ulang",
      });
      expect(again.status).toBe(200);
      expect(communityReportResponseSchema.parse(await again.json()).data.id).toBe(receipt.data.id);
    }
    expect(reported).toHaveLength(2);
    expect(reported.every((e) => !JSON.stringify(e).includes("Perlu ditinjau"))).toBe(true);
    expect(
      (
        await call(`/community-content/post/${p.id}/reports`, undefined, "POST", {
          reason: "Aturan",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(`/community-content/post/${p.id}/reports`, author, "POST", {
          reason: "Aturan",
          reporterId: other,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(`/community-content/comment/${p.id}/reports`, author, "POST", {
          reason: "Aturan",
        })
      ).status,
    ).toBe(404);
    const publicPost = await contentData(await call(targetPath("post", p.id), author));
    expect(JSON.stringify(publicPost)).not.toContain("reporterId");
    expect(JSON.stringify(publicPost)).not.toContain("Perlu ditinjau");
  });
  it("concurrent duplicate reports create one row and one event", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        call(`/community-content/post/${p.id}/reports`, other, "POST", { reason: "Aturan" }),
      ),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(4);
    expect(await prisma.communityReport.count({ where: { targetId: p.id } })).toBe(1);
    expect(reported).toHaveLength(1);
  });
  it("hide/remove close all target reports atomically; restore does not resurrect reports", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id),
      unrelated = await post(p.communityId);
    for (const id of [author, other, employer])
      await call(`/community-content/post/${p.id}/reports`, id, "POST", { reason: "Aturan" });
    await call(`/community-content/post/${unrelated.id}/reports`, other, "POST", {
      reason: "Laporan lain",
    });
    const result = await call(moderatePath("post", p.id), admin, "POST", {
      action: "hide",
      reason: "Aturan ruang",
    });
    expect(result.status).toBe(200);
    const rows = await prisma.communityReport.findMany({ where: { targetId: p.id } });
    expect(rows).toHaveLength(3);
    expect(
      rows.every((r) => r.status === "resolved" && r.resolvedBy === admin && r.resolvedAt !== null),
    ).toBe(true);
    expect(
      await prisma.communityReport.count({ where: { targetId: unrelated.id, status: "open" } }),
    ).toBe(1);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: p.id } });
    expect(log.meta).toMatchObject({ resolvedReports: 3, reason: "Aturan ruang" });
    await call(moderatePath("post", p.id), admin, "POST", {
      action: "restore",
      reason: "Sudah sesuai",
    });
    expect(await prisma.communityReport.count({ where: { targetId: p.id, status: "open" } })).toBe(
      0,
    );
  });
  it("report versus hide cannot leave an open report on hidden content", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    const [report, hide] = await Promise.all([
      call(`/community-content/post/${p.id}/reports`, other, "POST", { reason: "Aturan" }),
      call(moderatePath("post", p.id), admin, "POST", { action: "hide", reason: "Aturan" }),
    ]);
    expect([201, 404]).toContain(report.status);
    expect(hide.status).toBe(200);
    expect(await prisma.communityReport.count({ where: { targetId: p.id, status: "open" } })).toBe(
      0,
    );
  });
  it("admin removal resolves reports even after self deletion, then stays idempotent", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    await call(`/community-content/post/${p.id}/reports`, other, "POST", { reason: "Aturan" });
    await call(targetPath("post", p.id), author, "DELETE");
    const path = moderatePath("post", p.id);
    for (let i = 0; i < 2; i++)
      expect(
        (await call(path, admin, "POST", { action: "remove", reason: "Sudah ditinjau" })).status,
      ).toBe(200);
    const report = await prisma.communityReport.findFirstOrThrow({ where: { targetId: p.id } });
    expect(report).toMatchObject({ status: "resolved", resolvedBy: admin });
    expect(await prisma.auditLog.count({ where: { entityId: p.id } })).toBe(1);
    expect(moderated).toHaveLength(1);
    expect(await prisma.communityPost.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      body: "",
      status: "removed",
    });
  });
  it("reject requires admin and reason, is audited, and does not change content", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    const receipt = communityReportResponseSchema.parse(
      await (
        await call(`/community-content/post/${p.id}/reports`, other, "POST", { reason: "Tinjau" })
      ).json(),
    ).data;
    const path = `/admin/community-reports/${receipt.id}/reject`;
    expect((await call(path, other, "POST", { reason: "Coba" })).status).toBe(403);
    expect((await call(path, admin, "POST", { reason: " " })).status).toBe(400);
    const result = await call(path, admin, "POST", { reason: "Tidak melanggar aturan" });
    expect(result.status).toBe(200);
    expect(communityReportAdminResponseSchema.parse(await result.json()).data.status).toBe(
      "rejected",
    );
    expect((await call(path, admin, "POST", { reason: "Ulang" })).status).toBe(409);
    expect((await prisma.communityPost.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
      "published",
    );
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { entityId: receipt.id } })).action,
    ).toBe(AUDIT_ACTION.COMMUNITY_REPORT_REJECTED);
  });
  it("admin queue is private, oldest first, paginated by precise timestamps even after status changes", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    const stamp = "2000-01-01T01:00:00.123456Z";
    const ids = [uuidV7(), uuidV7(), uuidV7()].sort();
    for (const id of ids)
      await sql.query(
        "INSERT INTO community_reports(id,reporter_id,target_type,target_id,reason,created_at) VALUES($1,$2,'post',$3,'Aturan',$4)",
        [id, other, p.id, stamp],
      );
    expect((await call("/admin/community-reports", author)).status).toBe(403);
    const page = communityReportAdminListResponseSchema.parse(
      await (await call("/admin/community-reports?limit=2&status=open", admin)).json(),
    );
    // Other tests create later reports; the old microsecond fixtures are first.
    expect(page.data.map((r) => r.id)).toEqual(ids.slice(0, 2));
    await prisma.communityReport.update({
      where: { id: ids[1] },
      data: { status: "rejected", resolvedBy: admin, resolvedAt: new Date() },
    });
    const next = communityReportAdminListResponseSchema.parse(
      await (
        await call(
          `/admin/community-reports?limit=2&status=open&cursor=${encodeURIComponent(page.meta.nextCursor!)}`,
          admin,
        )
      ).json(),
    );
    expect(next.data[0]?.id).toBe(ids[2]);
    expect((await call("/admin/community-reports?cursor=invalid", admin)).status).toBe(400);
  });
  it("comment pagination preserves chronological order and never includes hidden/removed comments", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    const ids = [uuidV7(), uuidV7(), uuidV7()].sort();
    for (const id of ids)
      await sql.query(
        "INSERT INTO community_comments(id,post_id,author_id,body,created_at,updated_at) VALUES($1,$2,$3,'Balas','2000-01-01T01:00:00.123456Z',now())",
        [id, p.id, author],
      );
    const page = communityCommentListResponseSchema.parse(
      await (await call(`/community-posts/${p.id}/comments?limit=2`, other)).json(),
    );
    expect(page.data.map((r) => r.id)).toEqual(ids.slice(0, 2));
    await prisma.communityComment.update({ where: { id: ids[1] }, data: { status: "hidden" } });
    const next = communityCommentListResponseSchema.parse(
      await (
        await call(
          `/community-posts/${p.id}/comments?limit=2&cursor=${encodeURIComponent(page.meta.nextCursor!)}`,
          other,
        )
      ).json(),
    );
    expect(next.data.map((r) => r.id)).toEqual([ids[2]]);
    const p2 = await post(p.communityId);
    const unrelatedCursor = encodeKursor({ id: ids[0]!, sortAt: new Date("2000-01-01T01:00:00Z") });
    expect(
      (
        await call(
          `/community-posts/${p2.id}/comments?cursor=${encodeURIComponent(unrelatedCursor)}`,
          other,
        )
      ).status,
    ).toBe(200);
  });
  it("required audit failure rolls back status and report resolution and emits no moderation event", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    await call(`/community-content/post/${p.id}/reports`, other, "POST", { reason: "Aturan" });
    await sql.query(`CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit test failure'; END $$;
      CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit()`);
    try {
      expect(
        (
          await call(moderatePath("post", p.id), admin, "POST", {
            action: "hide",
            reason: "Aturan",
          })
        ).status,
      ).toBe(500);
      expect((await prisma.communityPost.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
        "published",
      );
      expect(
        await prisma.communityReport.count({ where: { targetId: p.id, status: "open" } }),
      ).toBe(1);
      const report = await prisma.communityReport.findFirstOrThrow({ where: { targetId: p.id } });
      expect(
        (
          await call(`/admin/community-reports/${report.id}/reject`, admin, "POST", {
            reason: "Tidak melanggar",
          })
        ).status,
      ).toBe(500);
      expect(
        (await prisma.communityReport.findUniqueOrThrow({ where: { id: report.id } })).status,
      ).toBe("open");
      expect(moderated).toEqual([]);
    } finally {
      await sql.query("DROP TRIGGER reject_audit ON audit_logs; DROP FUNCTION reject_audit()");
    }
  });
  it("moderation repeats are idempotent while a later hide/restore creates a distinct notification", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    for (let i = 0; i < 2; i++)
      await call(moderatePath("post", p.id), admin, "POST", { action: "hide", reason: "Aturan" });
    expect(moderated).toHaveLength(1);
    await call(moderatePath("post", p.id), admin, "POST", { action: "restore", reason: "Sesuai" });
    await call(moderatePath("post", p.id), admin, "POST", {
      action: "hide",
      reason: "Aturan baru",
    });
    expect(moderated).toHaveLength(3);
    await vi.waitFor(async () => {
      const n = await prisma.notification.findMany({
        where: {
          userId: author,
          type: "community.content_moderated",
          payload: { path: ["targetId"], equals: p.id },
        },
      });
      expect(n).toHaveLength(3);
      expect(n.every((r) => !JSON.stringify(r.payload).includes("Aturan"))).toBe(true);
    });
    const before = await prisma.notification.count({
      where: { userId: admin, type: "admin.community_report" },
    });
    const p2 = await post(p.communityId);
    await call(`/community-content/post/${p2.id}/reports`, other, "POST", {
      reason: "Rahasia pelapor",
    });
    await vi.waitFor(async () => {
      expect(
        await prisma.notification.count({
          where: { userId: admin, type: "admin.community_report" },
        }),
      ).toBe(before + 1);
    });
    const n = await prisma.notification.findFirstOrThrow({
      where: {
        userId: admin,
        type: "admin.community_report",
        payload: { path: ["targetId"], equals: p2.id },
      },
    });
    expect(JSON.stringify(n.payload)).not.toContain("Rahasia");
    expect(JSON.stringify(n.payload)).not.toContain("reporterId");
  });
  it("separate create/report quotas stop before persistence and return Retry-After", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room();
    for (let i = 0; i < 6; i++)
      expect(
        (await call(`/communities/${r.id}/posts`, author, "POST", { body: "Teks" })).status,
      ).toBe(201);
    const over = await call(`/communities/${r.id}/posts`, author, "POST", { body: "Teks" });
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await prisma.communityPost.count({ where: { communityId: r.id } })).toBe(6);
    const p = await post(r.id);
    for (let i = 0; i < 6; i++)
      expect(
        (
          await call(`/community-content/post/${p.id}/reports`, author, "POST", {
            reason: "Aturan",
          })
        ).status,
      ).toBe(i === 0 ? 201 : 200);
    expect(
      (await call(`/community-content/post/${p.id}/reports`, author, "POST", { reason: "Aturan" }))
        .status,
    ).toBe(429);
    expect(await prisma.communityReport.count({ where: { targetId: p.id } })).toBe(1);
  });
  it("exports all own post/comment/report states without another author's text or resolver identity", async (ctx) => {
    if (!available) return ctx.skip();
    const r = await room([author, other]);
    const p = await post(r.id),
      otherPost = await post(r.id, other, "Teks akun lain");
    const c = await comment(p.id);
    await comment(p.id, other);
    const report = communityReportResponseSchema.parse(
      await (
        await call(`/community-content/post/${p.id}/reports`, author, "POST", {
          reason: "Alasan milik saya",
        })
      ).json(),
    ).data;
    await call(moderatePath("post", p.id), admin, "POST", { action: "remove", reason: "Aturan" });
    const collected: Record<string, unknown> = {};
    for (const contributor of module.exportContributors)
      collected[contributor.bagian] = await contributor.kumpulkan(author);
    const own = dataExportSchema
      .pick({
        communityMemberships: true,
        communityPosts: true,
        communityComments: true,
        communityReports: true,
      })
      .parse(collected);
    expect(own.communityPosts.find((r) => r.id === p.id)).toMatchObject({
      body: "",
      status: "removed",
    });
    expect(own.communityPosts.some((r) => r.id === otherPost.id)).toBe(false);
    expect(own.communityComments.some((r) => r.id === c.id)).toBe(true);
    const receipt = own.communityReports.find((r) => r.id === report.id)!;
    expect(receipt.reason).toBe("Alasan milik saya");
    expect(receipt.resolvedAt).not.toBeNull();
    expect(JSON.stringify(own)).not.toContain("reporterId");
    expect(JSON.stringify(own)).not.toContain("resolvedBy");
  });
  it("a stale admin role cannot moderate inside the transaction", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    await expect(
      module.content.moderate(actor(other), "post", p.id, "hide", "Aturan"),
    ).rejects.toMatchObject({ code: "TIDAK_BERHAK" });
    expect((await prisma.communityPost.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
      "published",
    );
  });
  it("self deletion racing with restore always leaves a final empty tombstone", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    await call(moderatePath("post", p.id), admin, "POST", { action: "hide", reason: "Aturan" });
    const [erase, restore] = await Promise.all([
      call(targetPath("post", p.id), author, "DELETE"),
      call(moderatePath("post", p.id), admin, "POST", { action: "restore", reason: "Sesuai" }),
    ]);
    expect(erase.status).toBe(200);
    expect([200, 409]).toContain(restore.status);
    expect(await prisma.communityPost.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      status: "removed",
      body: "",
    });
  });
  it("PDP tombstones remain anonymous and cannot be restored through moderation", async (ctx) => {
    if (!available) return ctx.skip();
    const p = await post((await room()).id);
    await prisma.communityPost.update({
      where: { id: p.id },
      data: { authorId: null, status: "removed", body: "" },
    });
    expect((await call(targetPath("post", p.id), author)).status).toBe(404);
    const internal = communityContentResponseSchema.parse(
      await (await call(`/admin/community-content/post/${p.id}`, admin)).json(),
    ).data.content;
    expect(internal).toMatchObject({ author: null, body: "", status: "removed" });
    expect(
      (await call(moderatePath("post", p.id), admin, "POST", { action: "restore", reason: "Coba" }))
        .status,
    ).toBe(409);
    expect((await call(targetPath("post", p.id), author, "DELETE")).status).toBe(404);
  });
});
