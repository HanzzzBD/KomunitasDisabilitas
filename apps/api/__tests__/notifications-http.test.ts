// Integration HTTP notifikasi in-app (PR-047) — server Express nyata, token
// RS256 nyata, guard sesi dari registrar PR-019.
//
// AC yang dijaga file ini: "Event → row notifikasi", "Idempoten per notification
// id", "Cursor pagination stabil", ditambah dua hal yang hanya terlihat lewat
// HTTP: pengguna A tidak bisa menyentuh notifikasi B, dan cursor rusak dijawab
// 400 berpesan Bahasa Indonesia — bukan 500.
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import type { UserRole } from "@nawasena/schemas";
import { notificationListResponseSchema } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createEventBus, type EventBus } from "../src/core/events/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createNotificationsModule } from "../src/modules/notifications/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
const JOB = "018f4c1e-0000-7000-8000-0000000b0001";
const LAMARAN = "018f4c1e-0000-7000-8000-0000000a0001";

const tokens = createTokenService(SESSION_KEYS);

interface Baris {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Prisma palsu: tabel `notifications` in-memory dengan `id` sebagai KUNCI
 * PRIMER — `createMany({ skipDuplicates })` melewati yang sudah ada, persis
 * seperti ON CONFLICT DO NOTHING. Fake yang mengizinkan dua baris ber-id sama
 * akan membuat test idempotensi lulus atas perilaku yang tidak ada.
 */
function fakePrisma(rows: Baris[]) {
  interface WhereList {
    userId: string;
    readAt?: null;
    OR?: Array<{ createdAt: { lt: Date } | Date; id?: { lt: string } }>;
  }

  const cocok = (row: Baris, where: WhereList): boolean => {
    if (row.userId !== where.userId) return false;
    if (where.readAt === null && row.readAt !== null) return false;
    if (where.OR !== undefined) {
      const [lebihLama, seriID] = where.OR as [
        { createdAt: { lt: Date } },
        { createdAt: Date; id: { lt: string } },
      ];
      const lolos =
        row.createdAt.getTime() < lebihLama.createdAt.lt.getTime() ||
        (row.createdAt.getTime() === seriID.createdAt.getTime() && row.id < seriID.id.lt);
      if (!lolos) return false;
    }
    return true;
  };

  const client = {
    notification: {
      createMany: ({
        data,
        skipDuplicates,
      }: {
        data: Array<Omit<Baris, "readAt" | "createdAt">>;
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const item of data) {
          if (skipDuplicates === true && rows.some((r) => r.id === item.id)) continue;
          rows.push({
            ...item,
            readAt: null,
            // Berjarak satu detik supaya urutan tidak bergantung pada kecepatan
            // mesin yang menjalankan test.
            createdAt: new Date(Date.UTC(2026, 8, 5, 10, 0, rows.length)),
          });
          count += 1;
        }
        return Promise.resolve({ count });
      },

      findMany: ({ where, take }: { where: WhereList; take: number }) =>
        Promise.resolve(
          rows
            .filter((r) => cocok(r, where))
            .sort((x, y) => {
              const selisih = y.createdAt.getTime() - x.createdAt.getTime();
              return selisih !== 0 ? selisih : y.id < x.id ? -1 : 1;
            })
            .slice(0, take)
            .map((r) => ({ ...r })),
        ),

      count: ({ where }: { where: WhereList }) =>
        Promise.resolve(rows.filter((r) => cocok(r, where)).length),

      updateMany: ({
        where,
        data,
      }: {
        where: WhereList & { id: string };
        data: { readAt: Date };
      }) => {
        const sasaran = rows.filter(
          (r) => r.id === where.id && cocok(r, where) && (where.readAt !== null || true),
        );
        for (const row of sasaran) row.readAt = data.readAt;
        return Promise.resolve({ count: sasaran.length });
      },

      findFirst: ({ where }: { where: { id: string; userId: string } }) => {
        const row = rows.find((r) => r.id === where.id && r.userId === where.userId);
        return Promise.resolve(row === undefined ? null : { ...row });
      },
    },
  };
  return client as unknown as PrismaClient;
}

function testEnv(): Env {
  return loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
}

const akun: Record<string, { id: string; role: UserRole; tokenVersion: number }> = {
  [A]: { id: A, role: "seeker", tokenVersion: 0 },
  [B]: { id: B, role: "seeker", tokenVersion: 0 },
};

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot(): Promise<{ base: string; rows: Baris[]; events: EventBus }> {
  const env = testEnv();
  const rows: Baris[] = [];
  const logger = createLogger(env, {
    destination: new Writable({
      write(_chunk, _e, cb) {
        cb();
      },
    }),
  });
  const events = createEventBus({ logger });

  const guards = createAccessGuards({
    tokenService: createTokenService(SESSION_KEYS),
    findSessionUser: (id) => Promise.resolve(akun[id] ?? null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createNotificationsModule({
          prisma: fakePrisma(rows),
          routes: registry.forModule("/api/v1"),
          events,
        }),
      );
    },
  });
  // Gerbang PR-019: route tanpa deklarasi akses membuat boot GAGAL.
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, rows, events };
}

function tokenUntuk(userId: string): Promise<string> {
  return tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 });
}

function ambil(base: string, path: string, token?: string) {
  return fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function tandai(base: string, id: string, token: string) {
  return fetch(`${base}/me/notifications/${id}/read`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * Bus TIDAK menunggu pelanggannya (core/events batas 3), jadi `emit` kembali
 * sebelum barisnya tertulis. Menunggu satu putaran microtask cukup: handler-nya
 * hanya satu `await` ke repository in-memory.
 */
async function tunggu(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("akses", () => {
  it("tanpa token → 401", async () => {
    const { base } = await boot();
    const res = await ambil(base, "/me/notifications");
    expect(res.status).toBe(401);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "TIDAK_TERAUTENTIKASI" });
  });

  it("token tanda tangan asing → 401", async () => {
    const { base } = await boot();
    const res = await ambil(base, "/me/notifications", "bukan.token.sah");
    expect(res.status).toBe(401);
  });
});

describe("event → row notifikasi (AC)", () => {
  it("auth.user_registered melahirkan sambutan yang terbaca di daftar", async () => {
    const { base, events } = await boot();
    events.emit("auth.user_registered", {
      userId: A,
      registeredAt: "2026-09-05T10:00:00.000Z",
    });
    await tunggu();

    const res = await ambil(base, "/me/notifications", await tokenUntuk(A));
    expect(res.status).toBe(200);

    // Divalidasi lewat SKEMA KONTRAKNYA, bukan dicocokkan field per field:
    // response yang lolos di sini adalah response yang juga akan diterima klien
    // web dan mobile yang meng-generate dirinya dari kontrak yang sama.
    const body = notificationListResponseSchema.parse(await res.json());
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.type).toBe("auth.selamat_datang");
    expect(body.data[0]?.title.id).toBe("Selamat datang di Nawasena");
    expect(body.data[0]?.title["id-simple"]).not.toBe(body.data[0]?.title.id);
    expect(body.meta.unreadCount).toBe(1);
  });

  it("application.submitted → notifikasi pelamar, dengan referensi id di params", async () => {
    const { base, events } = await boot();
    events.emit("application.submitted", {
      applicationId: LAMARAN,
      userId: A,
      jobId: JOB,
      submittedAt: "2026-09-05T10:00:00.000Z",
    });
    await tunggu();

    const body = notificationListResponseSchema.parse(
      await (await ambil(base, "/me/notifications", await tokenUntuk(A))).json(),
    );
    expect(body.data[0]?.type).toBe("lamaran.terkirim");
    expect(body.data[0]?.params).toEqual({ applicationId: LAMARAN, jobId: JOB });
  });

  it("application.status_changed terbit DUA KALI → satu baris (AC idempoten)", async () => {
    const { base, events, rows } = await boot();
    const event = {
      applicationId: LAMARAN,
      userId: A,
      jobId: JOB,
      from: "in_review",
      to: "interview",
      changedAt: "2026-09-05T10:00:00.000Z",
    } as const;

    events.emit("application.status_changed", event);
    await tunggu();
    // Terbit ulang dengan waktu BERBEDA — persis bentuk pengulangan yang paling
    // mungkin terjadi di lapangan.
    events.emit("application.status_changed", { ...event, changedAt: "2026-09-05T10:05:00.000Z" });
    await tunggu();

    expect(rows).toHaveLength(1);
    const body = notificationListResponseSchema.parse(
      await (await ambil(base, "/me/notifications", await tokenUntuk(A))).json(),
    );
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.title.id).toBe("Status lamaran: Undangan wawancara");
  });

  it("notifikasi milik A tidak terlihat oleh B", async () => {
    const { base, events } = await boot();
    events.emit("auth.user_registered", { userId: A, registeredAt: "2026-09-05T10:00:00.000Z" });
    await tunggu();

    const body = notificationListResponseSchema.parse(
      await (await ambil(base, "/me/notifications", await tokenUntuk(B))).json(),
    );
    expect(body.data).toEqual([]);
    expect(body.meta.unreadCount).toBe(0);
  });
});

describe("GET /me/notifications — pagination & validasi", () => {
  async function isi(events: EventBus, jumlah: number): Promise<void> {
    for (let i = 0; i < jumlah; i += 1) {
      events.emit("application.submitted", {
        applicationId: `018f4c1e-0000-7000-8000-00000000${String(i).padStart(4, "0")}`,
        userId: A,
        jobId: JOB,
        submittedAt: "2026-09-05T10:00:00.000Z",
      });
    }
    await tunggu();
  }

  it("cursor menyusuri seluruh daftar tanpa terlewat/terulang (AC)", async () => {
    const { base, events } = await boot();
    await isi(events, 5);
    const token = await tokenUntuk(A);

    const dilihat: string[] = [];
    let cursor: string | null = null;
    for (let putaran = 0; putaran < 5; putaran += 1) {
      const q: string =
        cursor === null ? "?limit=2" : `?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const body = notificationListResponseSchema.parse(
        await (await ambil(base, `/me/notifications${q}`, token)).json(),
      );
      dilihat.push(...body.data.map((n) => n.id));
      cursor = body.meta.nextCursor;
      if (cursor === null) break;
    }

    expect(dilihat).toHaveLength(5);
    expect(new Set(dilihat).size).toBe(5);
    expect(cursor).toBeNull();
  });

  it("cursor rusak → 400 berpesan Bahasa Indonesia, bukan 500", async () => {
    const { base, events } = await boot();
    await isi(events, 2);
    const res = await ambil(base, "/me/notifications?cursor=%23%23%23", await tokenUntuk(A));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; message: string; hint?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("Input tidak valid");
    expect(body.hint).toContain("Muat ulang");
  });

  it("limit di luar 1–100 ditolak di gerbang", async () => {
    const { base } = await boot();
    const res = await ambil(base, "/me/notifications?limit=1000", await tokenUntuk(A));
    expect(res.status).toBe(400);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("unreadOnly=true menyaring yang sudah dibaca", async () => {
    const { base, events, rows } = await boot();
    await isi(events, 3);
    const token = await tokenUntuk(A);
    await tandai(base, (rows[0] as Baris).id, token);

    const body = notificationListResponseSchema.parse(
      await (await ambil(base, "/me/notifications?unreadOnly=true", token)).json(),
    );
    expect(body.data).toHaveLength(2);
    expect(body.data.every((n) => n.readAt === null)).toBe(true);
  });
});

describe("POST /me/notifications/:id/read", () => {
  async function satu(): Promise<{ base: string; rows: Baris[]; id: string }> {
    const { base, events, rows } = await boot();
    events.emit("auth.user_registered", { userId: A, registeredAt: "2026-09-05T10:00:00.000Z" });
    await tunggu();
    return { base, rows, id: (rows[0] as Baris).id };
  }

  it("menandai dibaca → 200, unreadCount ikut turun", async () => {
    const { base, id } = await satu();
    const res = await tandai(base, id, await tokenUntuk(A));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { readAt: string | null };
      meta: { unreadCount: number };
    };
    expect(body.data.readAt).not.toBeNull();
    expect(body.meta.unreadCount).toBe(0);
  });

  it("penandaan kedua tetap 200 dan tidak menggeser waktu baca", async () => {
    const { base, id } = await satu();
    const token = await tokenUntuk(A);
    const pertama = (await (await tandai(base, id, token)).json()) as { data: { readAt: string } };
    const kedua = (await (await tandai(base, id, token)).json()) as { data: { readAt: string } };
    expect(kedua.data.readAt).toBe(pertama.data.readAt);
  });

  it("notifikasi milik orang lain → 404, dan TIDAK ikut tertandai", async () => {
    const { base, rows, id } = await satu();
    const res = await tandai(base, id, await tokenUntuk(B));

    expect(res.status).toBe(404);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "RUTE_TIDAK_DITEMUKAN" });
    expect((rows[0] as Baris).readAt).toBeNull();
  });

  it("id bukan UUID ditolak 400 di gerbang, bukan 500 dari Prisma", async () => {
    const { base } = await boot();
    const res = await tandai(base, "bukan-uuid", await tokenUntuk(A));
    expect(res.status).toBe(400);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
