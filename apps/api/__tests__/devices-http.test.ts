// Integration HTTP pendaftaran perangkat push (PR-048a) — server Express nyata,
// token RS256 nyata, guard sesi dari registrar PR-019.
//
// Yang dijaga berkas ini: idempotensi pendaftaran ulang, PERPINDAHAN kepemilikan
// saat perangkat berganti akun, penolakan input di gerbang, dan satu hal yang
// hanya terlihat lewat HTTP — bahwa `fcmToken` tidak pernah ikut kembali di
// badan jawaban.
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import type { UserRole } from "@nawasena/schemas";
import { deviceResponseSchema } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createEventBus } from "../src/core/events/index.js";
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

const tokens = createTokenService(SESSION_KEYS);

interface BarisDevice {
  id: string;
  userId: string;
  fcmToken: string;
  platform: string;
  lastSeenAt: Date;
  createdAt: Date;
}

/**
 * Prisma palsu: tabel `devices` in-memory dengan `fcm_token` sebagai kunci UNIK —
 * persis yang membuat `upsert()` cukup satu statement di repository. Fake yang
 * mengizinkan dua baris ber-token sama akan membuat test perpindahan kepemilikan
 * lulus atas perilaku yang tidak ada.
 */
function fakePrisma(rows: BarisDevice[]) {
  interface UpsertArgs {
    where: { fcmToken: string };
    create: { id: string; userId: string; fcmToken: string; platform: string };
    update: { userId: string; platform: string; lastSeenAt: Date };
  }

  const client = {
    device: {
      upsert: ({ where, create, update }: UpsertArgs) => {
        const ada = rows.find((r) => r.fcmToken === where.fcmToken);
        if (ada === undefined) {
          const lahir: BarisDevice = {
            ...create,
            lastSeenAt: new Date("2026-09-05T10:00:00.000Z"),
            createdAt: new Date("2026-09-05T10:00:00.000Z"),
          };
          rows.push(lahir);
          return Promise.resolve({ ...lahir });
        }
        // `createdAt` TIDAK disentuh — ia menyatakan kapan perangkatnya pertama
        // dikenal, dan itu tidak berubah karena penggunanya berganti.
        Object.assign(ada, update);
        return Promise.resolve({ ...ada });
      },
      findMany: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(rows.filter((r) => r.userId === where.userId).map((r) => ({ ...r }))),
      deleteMany: ({ where }: { where: { fcmToken: string } }) => {
        const sebelum = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i]?.fcmToken === where.fcmToken) rows.splice(i, 1);
        }
        return Promise.resolve({ count: sebelum - rows.length });
      },
    },
    // Modul ini juga merakit repository notifikasi; tidak dipakai berkas ini.
    notification: {
      createMany: () => Promise.resolve({ count: 0 }),
      findMany: () => Promise.resolve([]),
      count: () => Promise.resolve(0),
      updateMany: () => Promise.resolve({ count: 0 }),
      findFirst: () => Promise.resolve(null),
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

async function boot(): Promise<{ base: string; rows: BarisDevice[] }> {
  const env = testEnv();
  const rows: BarisDevice[] = [];
  const logger = createLogger(env, {
    destination: new Writable({
      write(_chunk, _e, cb) {
        cb();
      },
    }),
  });

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
          events: createEventBus({ logger }),
        }).router,
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, rows };
}

function tokenUntuk(userId: string): Promise<string> {
  return tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 });
}

function daftar(base: string, token: string | undefined, body: unknown) {
  return fetch(`${base}/me/devices`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

const PERANGKAT = { fcmToken: "token-perangkat-rina-001", platform: "android" } as const;

describe("akses", () => {
  it("tanpa token → 401", async () => {
    const { base } = await boot();
    const res = await daftar(base, undefined, PERANGKAT);
    expect(res.status).toBe(401);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "TIDAK_TERAUTENTIKASI" });
  });
});

describe("POST /me/devices — pendaftaran", () => {
  it("perangkat baru → 200, dan jawabannya TIDAK memuat fcmToken", async () => {
    const { base, rows } = await boot();
    const res = await daftar(base, await tokenUntuk(A), PERANGKAT);

    expect(res.status).toBe(200);
    const mentah = (await res.json()) as { data: Record<string, unknown> };
    // Token yang ikut kembali adalah token yang melewati satu tempat lagi:
    // log proxy, cache klien, laporan galat yang menyertakan body response.
    expect(Object.keys(mentah.data)).not.toContain("fcmToken");
    expect(JSON.stringify(mentah)).not.toContain(PERANGKAT.fcmToken);
    // `userId` juga tidak, meski pemanggilnya memang pemiliknya.
    expect(Object.keys(mentah.data)).not.toContain("userId");

    // Divalidasi lewat SKEMA KONTRAKNYA — response yang lolos di sini adalah
    // yang juga akan diterima klien mobile yang meng-generate dirinya dari
    // kontrak yang sama (PR-088/094).
    const body = deviceResponseSchema.parse(mentah);
    expect(body.data.platform).toBe("android");
    expect(rows).toHaveLength(1);
  });

  it("pendaftaran ulang token yang sama → tetap satu baris (idempoten)", async () => {
    // Klien FCM memanggil ini pada SETIAP peluncuran aplikasi. Baris kedua per
    // peluncuran berarti tabel yang tumbuh sebesar jumlah pembukaan aplikasi,
    // dan push yang terkirim berkali-kali ke perangkat yang sama.
    const { base, rows } = await boot();
    const token = await tokenUntuk(A);

    const pertama = await daftar(base, token, PERANGKAT);
    const kedua = await daftar(base, token, PERANGKAT);

    expect(pertama.status).toBe(200);
    expect(kedua.status).toBe(200);
    expect(rows).toHaveLength(1);

    // Id barisnya TIDAK berubah — pendaftaran ulang bukan kelahiran baru.
    const idPertama = (await pertama.json()) as { data: { id: string } };
    const idKedua = (await kedua.json()) as { data: { id: string } };
    expect(idKedua.data.id).toBe(idPertama.data.id);
  });

  it("perangkat berpindah akun → kepemilikan BERPINDAH, tidak menggandakan", async () => {
    // Keadaan nyata: satu ponsel, pemiliknya keluar, orang lain masuk. Klien
    // FCM mengirim token yang SAMA. Bila kedua baris hidup berdampingan,
    // pemilik lama terus menerima notifikasi pemilik baru di layar kuncinya —
    // kebocoran yang tidak meninggalkan gejala apa pun di sisi kita.
    const { base, rows } = await boot();

    await daftar(base, await tokenUntuk(A), PERANGKAT);
    await daftar(base, await tokenUntuk(B), PERANGKAT);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(B);
  });

  it("satu pengguna boleh punya banyak perangkat", async () => {
    const { base, rows } = await boot();
    const token = await tokenUntuk(A);

    await daftar(base, token, { fcmToken: "token-ponsel", platform: "android" });
    await daftar(base, token, { fcmToken: "token-tablet", platform: "ios" });

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === A)).toBe(true);
  });
});

describe("POST /me/devices — validasi di gerbang", () => {
  it.each([
    ["token kosong", { fcmToken: "", platform: "android" }],
    ["token hanya spasi", { fcmToken: "   ", platform: "android" }],
    ["platform tidak dikenal", { fcmToken: "token-x", platform: "symbian" }],
    ["platform hilang", { fcmToken: "token-x" }],
    ["token hilang", { platform: "android" }],
  ])("%s → 400", async (_nama, body) => {
    const { base, rows } = await boot();
    const res = await daftar(base, await tokenUntuk(A), body);

    expect(res.status).toBe(400);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "VALIDATION_ERROR" });
    // Tidak ada baris yang lahir dari input yang ditolak.
    expect(rows).toHaveLength(0);
  });

  it("field asing ditolak, bukan diabaikan diam-diam", async () => {
    // `.strict()` di skema. Klien yang mengirim `userId` mengira ia bisa
    // mendaftarkan perangkat untuk orang lain — ia harus mendapat penolakan
    // yang jelas, bukan keberhasilan yang diam-diam mengabaikan maksudnya.
    const { base } = await boot();
    const res = await daftar(base, await tokenUntuk(A), { ...PERANGKAT, userId: B });

    expect(res.status).toBe(400);
  });

  it("token 4097 karakter ditolak", async () => {
    const { base } = await boot();
    const res = await daftar(base, await tokenUntuk(A), {
      fcmToken: "t".repeat(4097),
      platform: "android",
    });
    expect(res.status).toBe(400);
  });
});
