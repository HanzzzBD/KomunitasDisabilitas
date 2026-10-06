// PR-113: gunakan schema acak, tidak reset/rollback database aplikasi.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { uuidV7 } from "../src/core/ids/index.js";
import {
  countCommunityPurgeRows,
  purgeCommunityRows,
} from "../src/modules/users/services/community-purge.js";

const databaseUrl = process.env.COMMUNITY_MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const schema = `pr113_${uuidV7().replaceAll("-", "")}`;
const db = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
const datasource = new URL(databaseUrl ?? "postgresql://nawasena:nawasena@localhost:5433/nawasena");
datasource.searchParams.set("schema", schema);
const prisma = new PrismaClient({ datasourceUrl: datasource.toString() });
const migrationDir = new URL("../prisma/migrations/20261006090000_24_community/", import.meta.url);
const up = readFileSync(fileURLToPath(new URL("migration.sql", migrationDir)), "utf8");
const down = readFileSync(fileURLToPath(new URL("down.sql", migrationDir)), "utf8");
let available = false;
let created = false;
const author = uuidV7();
const other = uuidV7();
const room = uuidV7();
const post = uuidV7();
const comment = uuidV7();

beforeAll(async () => {
  if (!databaseUrl) return;
  try {
    await db.connect();
  } catch (error) {
    if (process.env.COMMUNITY_MIGRATION_DATABASE_URL || process.env.CI) throw error;
    return;
  }
  await db.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await db.query(`SET search_path TO "${schema}", public`);
  // Tabel lama sengaja minimal: migrasi baru tidak boleh memerlukan perubahan user.
  await db.query('CREATE TABLE "users" ("id" UUID PRIMARY KEY, "legacy" TEXT NOT NULL)');
  await db.query('INSERT INTO "users" VALUES ($1, $2), ($3, $4)', [
    author,
    "versi lama",
    other,
    "pengguna lain",
  ]);
  await db.query("CREATE TABLE audit_logs (id UUID PRIMARY KEY, actor_id UUID, action TEXT)");
  await db.query("INSERT INTO audit_logs VALUES ($1, $2, $3)", [
    uuidV7(),
    author,
    "community.content_moderated",
  ]);
  await db.query(up);
  available = true;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (created) {
    await db.query("ROLLBACK");
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
  await db.end();
});

async function fixture() {
  await prisma.community.create({
    data: {
      id: room,
      slug: "karier",
      name: "Karier",
      description: "Diskusi",
      type: "topic",
      createdBy: author,
    },
  });
  await prisma.communityMembership.create({ data: { communityId: room, userId: author } });
  await prisma.communityPost.create({
    data: { id: post, communityId: room, authorId: author, body: "peluang kerja" },
  });
  await prisma.communityComment.create({
    data: { id: comment, postId: post, authorId: author, body: "balasan" },
  });
}

describe("migrasi 24 Community (PostgreSQL)", () => {
  it("up/down/up mempertahankan tabel/data lama, tidak butuh perubahan kode versi lama", async (ctx) => {
    if (!available) return ctx.skip();
    await db.query(down);
    expect((await db.query('SELECT "legacy" FROM "users" WHERE id=$1', [author])).rows).toEqual([
      { legacy: "versi lama" },
    ]);
    await db.query(up);
    const columns = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position",
      [schema, "users"],
    );
    expect(columns.rows.map((r: { column_name: string }) => r.column_name)).toEqual([
      "id",
      "legacy",
    ]);
    await fixture();
  });

  it("membership unik, komentar satu tingkat, soft status dan FK mempertahankan konten", async (ctx) => {
    if (!available) return ctx.skip();
    await expect(
      prisma.communityMembership.create({ data: { communityId: room, userId: author } }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(db.query("DELETE FROM community_posts WHERE id=$1", [post])).rejects.toMatchObject(
      { code: "23001" },
    );
    for (const status of ["hidden", "removed", "published"] as const) {
      expect(
        (await prisma.communityPost.update({ where: { id: post }, data: { status } })).status,
      ).toBe(status);
    }
    const columns = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2",
      [schema, "community_comments"],
    );
    expect(columns.rows.map((r: { column_name: string }) => r.column_name)).not.toContain(
      "parent_comment_id",
    );
    await expect(
      db.query("UPDATE community_posts SET status=$1 WHERE id=$2", ["draft", post]),
    ).rejects.toMatchObject({ code: "22P02" });
  });

  it("constraint city dan resolusi report tidak menerima data yang kontradiktif", async (ctx) => {
    if (!available) return ctx.skip();
    await expect(
      prisma.community.create({
        data: { id: uuidV7(), slug: "kota", name: "Kota", description: "Diskusi", type: "city" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.communityPost.update({ where: { id: post }, data: { body: "" } }),
    ).rejects.toThrow();
    await expect(
      prisma.communityReport.create({
        data: {
          id: uuidV7(),
          reporterId: other,
          targetType: "post",
          targetId: post,
          reason: "Spam",
          status: "resolved",
        },
      }),
    ).rejects.toThrow();
  });

  it("timestamp timestamptz, indeks feed/queue dan FTS terpasang dan dapat dipakai", async (ctx) => {
    if (!available) return ctx.skip();
    const columns = await db.query(
      "SELECT data_type FROM information_schema.columns WHERE table_schema=$1 AND column_name LIKE $2 AND table_name <> $3",
      [schema, "%_at", "users"],
    );
    expect(columns.rows.length).toBeGreaterThan(5);
    expect(
      columns.rows.every((r: { data_type: string }) => r.data_type === "timestamp with time zone"),
    ).toBe(true);
    const indexes = await db.query("SELECT indexname FROM pg_indexes WHERE schemaname=$1", [
      schema,
    ]);
    const names = indexes.rows.map((r: { indexname: string }) => r.indexname);
    expect(names).toContain("community_posts_community_id_status_created_at_id_idx");
    expect(names).toContain("community_reports_status_created_at_id_idx");
    await db.query("SET enable_seqscan = off");
    const plan = await db.query(
      "EXPLAIN SELECT id FROM community_posts WHERE to_tsvector('indonesian', body) @@ plainto_tsquery('indonesian', 'kerja')",
    );
    expect(JSON.stringify(plan.rows)).toContain("community_posts_body_fts_gin");
    await db.query("RESET enable_seqscan");
  });

  it("PDP membersihkan body dan identitas, mempertahankan ID/moderasi/target report", async (ctx) => {
    if (!available) return ctx.skip();
    const mine = uuidV7();
    const theirs = uuidV7();
    await prisma.communityReport.create({
      data: {
        id: mine,
        reporterId: author,
        targetType: "comment",
        targetId: comment,
        reason: "Laporan pribadi",
      },
    });
    await prisma.communityReport.create({
      data: {
        id: theirs,
        reporterId: other,
        targetType: "post",
        targetId: post,
        reason: "Spam",
        status: "resolved",
        resolvedBy: author,
        resolvedAt: new Date(),
      },
    });
    expect(await countCommunityPurgeRows(prisma, author)).toBe(5);
    const untouched = uuidV7();
    await prisma.communityPost.create({
      data: { id: untouched, communityId: room, authorId: other, body: "Teks pengguna lain" },
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await purgeCommunityRows(tx, author);
        throw new Error("Batalkan transaksi uji");
      }),
    ).rejects.toThrow("Batalkan transaksi uji");
    expect(await prisma.communityPost.findUnique({ where: { id: post } })).toMatchObject({
      authorId: author,
      body: "peluang kerja",
      status: "published",
    });
    await prisma.$transaction((tx) => purgeCommunityRows(tx, author));
    expect(await prisma.communityPost.findUnique({ where: { id: post } })).toMatchObject({
      authorId: null,
      body: "",
      status: "removed",
    });
    expect(await prisma.communityComment.findUnique({ where: { id: comment } })).toMatchObject({
      authorId: null,
      body: "",
      status: "removed",
    });
    expect(await prisma.communityReport.findUnique({ where: { id: mine } })).toBeNull();
    expect(await prisma.communityReport.findUnique({ where: { id: theirs } })).toMatchObject({
      targetId: post,
      status: "resolved",
      resolvedBy: null,
    });
    expect(await prisma.community.findUnique({ where: { id: room } })).toMatchObject({
      createdBy: null,
    });
    expect(await countCommunityPurgeRows(prisma, author)).toBe(0);
    // DELETE user setelah pembersihan membawa membership, tidak menghapus konten.
    await db.query('DELETE FROM "users" WHERE id=$1', [author]);
    expect(await prisma.communityMembership.count({ where: { userId: author } })).toBe(0);
    expect(await prisma.communityPost.count({ where: { id: post } })).toBe(1);
    expect(await prisma.communityPost.findUnique({ where: { id: untouched } })).toMatchObject({
      authorId: other,
      body: "Teks pengguna lain",
      status: "published",
    });
    expect(
      (await db.query("SELECT action FROM audit_logs WHERE actor_id=$1", [author])).rows,
    ).toEqual([{ action: "community.content_moderated" }]);
  });
});
