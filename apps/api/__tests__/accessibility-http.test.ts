// Integration HTTP preferensi aksesibilitas (PR-034) — server Express nyata,
// token RS256 nyata, guard sesi dari registrar PR-019.
//
// AC yang dijaga file ini: "User A tidak bisa baca/ubah user B", "Nilai di luar
// rentang ditolak dengan pesan Bahasa Indonesia", "Upsert idempoten", dan
// "Baris bawaan lahir dari event auth.user_registered".
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import type { UserRole } from "@nawasena/schemas";
import {
  ACCESSIBILITY_DEFAULTS,
  ACCESSIBILITY_PROFILE_KOSONG,
  accessibilityProfileSchema,
  type AccessibilityProfile,
} from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createEventBus } from "../src/core/events/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createAccessibilityModule } from "../src/modules/accessibility/index.js";
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

/** Baris `accessibility_profiles` apa adanya, termasuk kolom internal. */
interface BarisPreferensi extends AccessibilityProfile {
  userId: string;
  updatedAt: Date;
}

/**
 * Prisma palsu: tabel `accessibility_profiles` in-memory dengan `userId`
 * sebagai kunci primer — persis yang membuat `upsert()` cukup satu statement
 * di repository, jadi fake yang mengizinkan dua baris per pengguna akan membuat
 * test lulus atas perilaku yang tidak ada.
 */
function fakePrisma(rows: BarisPreferensi[]) {
  type Patch = Partial<AccessibilityProfile>;
  const ambil = (userId: string) => rows.find((r) => r.userId === userId);

  const client = {
    accessibilityProfile: {
      findUnique: ({ where }: { where: { userId: string } }) => {
        const found = ambil(where.userId);
        // SALINAN, bukan referensi — Prisma sungguhan tidak pernah mengembalikan
        // objek yang sama dengan baris yang kemudian diperbarui.
        return Promise.resolve(found === undefined ? null : { ...found });
      },
      upsert: ({
        where,
        update,
        create,
      }: {
        where: { userId: string };
        update: Patch;
        create: Patch & { userId: string };
      }) => {
        const baris = ambil(where.userId);
        if (baris === undefined) {
          // Kolomnya nullable tanpa `@default` sejak migrasi 09: yang tidak
          // disebut `create` lahir NULL, bukan bawaan.
          const lahir: BarisPreferensi = {
            ...ACCESSIBILITY_PROFILE_KOSONG,
            ...create,
            updatedAt: new Date(),
          };
          rows.push(lahir);
          return Promise.resolve({ ...lahir });
        }
        // `update` menyebut HANYA field yang dikirim; sisanya tidak disentuh.
        Object.assign(baris, update, { updatedAt: new Date() });
        return Promise.resolve({ ...baris });
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

async function boot(options: { baris?: BarisPreferensi[] } = {}) {
  const env = testEnv();
  const baris = options.baris ?? [];
  const logger = createLogger(env, {
    destination: new Writable({
      write(_chunk, _e, cb) {
        cb();
      },
    }),
  });
  const prisma = fakePrisma(baris);
  const events = createEventBus({ logger });

  const guards = createAccessGuards({
    tokenService: createTokenService(SESSION_KEYS),
    findSessionUser: (id) => Promise.resolve(akun[id] ?? null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createAccessibilityModule({
          prisma,
          routes: registry.forModule("/api/v1"),
          auditLog: () => {},
          events,
        }).router,
      );
    },
  });
  // Gerbang PR-019: route tanpa deklarasi akses membuat boot GAGAL.
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, baris, events, registry, api };
}

async function tokenUntuk(userId: string): Promise<string> {
  return tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 });
}

function ambil(base: string, path: string, token?: string) {
  return fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function simpan(base: string, token: string, body: unknown) {
  return fetch(`${base}/me/accessibility`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function barisUntuk(
  userId: string,
  overrides: Partial<AccessibilityProfile> = {},
): BarisPreferensi {
  return {
    userId,
    ...ACCESSIBILITY_DEFAULTS,
    ...overrides,
    updatedAt: new Date("2026-08-01T03:00:00.000Z"),
  };
}

describe("GET /api/v1/me/accessibility — akses", () => {
  it("tanpa token → 401 TIDAK_TERAUTENTIKASI", async () => {
    const { base } = await boot();
    const res = await ambil(base, "/me/accessibility");

    expect(res.status).toBe(401);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "TIDAK_TERAUTENTIKASI" });
  });

  it("token tanda tangan asing → 401 SESI_TIDAK_VALID", async () => {
    const { base } = await boot();
    const res = await ambil(base, "/me/accessibility", "bukan.token.sah");

    expect(res.status).toBe(401);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "SESI_TIDAK_VALID" });
  });
});

describe("GET /api/v1/me/accessibility — isi", () => {
  it("belum punya baris → 200 tujuh NULL, dan TIDAK ada baris yang lahir", async () => {
    // "Belum diatur" dikirim apa adanya. Menjawab bawaan — yang dilakukan versi
    // sebelumnya — membuat akun yang belum pernah memilih tak bisa dibedakan
    // dari akun yang memilih bawaan, dan itu cukup untuk memadamkan sinyal OS
    // pengguna di klien selamanya (ADR-008, migrasi 09).
    const { base, baris } = await boot();
    const res = await ambil(base, "/me/accessibility", await tokenUntuk(A));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(accessibilityProfileSchema.safeParse(body.data).success).toBe(true);
    expect(body.data).toEqual(ACCESSIBILITY_PROFILE_KOSONG);
    // Endpoint baca tidak menulis apa pun — bukan sekadar "hasilnya sama".
    expect(baris).toHaveLength(0);
  });

  it("punya baris → nilai tersimpan, tanpa kolom internal", async () => {
    const { base } = await boot({ baris: [barisUntuk(A, { textScale: 175, highContrast: true })] });
    const body = (await (await ambil(base, "/me/accessibility", await tokenUntuk(A))).json()) as {
      data: Record<string, unknown>;
    };

    expect(body.data).toEqual({ ...ACCESSIBILITY_DEFAULTS, textScale: 175, highContrast: true });
    for (const terlarang of ["userId", "updatedAt"]) {
      expect(body.data).not.toHaveProperty(terlarang);
    }
  });

  it("token A tidak pernah melihat baris B (AC: isolasi antar pengguna)", async () => {
    const { base } = await boot({
      baris: [
        barisUntuk(A, { textScale: 120 }),
        barisUntuk(B, { textScale: 200, screenReaderHint: true }),
      ],
    });

    const dariA = (await (await ambil(base, "/me/accessibility", await tokenUntuk(A))).json()) as {
      data: AccessibilityProfile;
    };

    expect(dariA.data.textScale).toBe(120);
    expect(dariA.data.screenReaderHint).toBe(false);
  });

  it("tidak ada route ber-param untuk menyebut pengguna lain → 404, bukan 403", async () => {
    // Isolasinya STRUKTURAL: bukan pemeriksaan yang menolak, melainkan saluran
    // yang tidak pernah dibuat. Menguji "403" akan menguji desain yang lain.
    const { base } = await boot({ baris: [barisUntuk(B, { textScale: 200 })] });
    const token = await tokenUntuk(A);

    expect((await ambil(base, `/accessibility/${B}`, token)).status).toBe(404);
    expect((await ambil(base, `/me/accessibility/${B}`, token)).status).toBe(404);
  });
});

describe("PUT /api/v1/me/accessibility — upsert", () => {
  it("pengguna tanpa baris → baris lahir HANYA berisi field yang dikirim", async () => {
    // Enam sisanya NULL. Melahirkannya berisi bawaan berarti satu PUT berisi
    // satu pilihan diam-diam mencatat tujuh.
    const { base, baris } = await boot();

    const res = await simpan(base, await tokenUntuk(A), { textScale: 150 });

    expect(res.status).toBe(200);
    expect((await res.json()) as { data: unknown }).toEqual({
      data: { ...ACCESSIBILITY_PROFILE_KOSONG, textScale: 150 },
    });
    expect(baris).toHaveLength(1);
    expect(baris[0]?.userId).toBe(A);
  });

  it("badan yang sama dikirim dua kali → jawaban sama, dan tetap SATU baris", async () => {
    const { base, baris } = await boot();
    const token = await tokenUntuk(A);
    const badan = { textScale: 150, reduceMotion: true };

    const pertama = (await (await simpan(base, token, badan)).json()) as unknown;
    const kedua = (await (await simpan(base, token, badan)).json()) as unknown;

    expect(kedua).toEqual(pertama);
    expect(baris).toHaveLength(1);
  });

  it("patch sebagian tidak mengembalikan field lain ke bawaan", async () => {
    const { base } = await boot({
      baris: [barisUntuk(A, { textScale: 175, simpleLanguage: true })],
    });

    const res = await simpan(base, await tokenUntuk(A), { highContrast: true });

    expect((await res.json()) as { data: AccessibilityProfile }).toEqual({
      data: {
        ...ACCESSIBILITY_DEFAULTS,
        textScale: 175,
        simpleLanguage: true,
        highContrast: true,
      },
    });
  });

  it("badan kosong sah — pengguna tanpa baris mendapat baris KOSONG, bukan baris bawaan", async () => {
    // Baris lahir, tetapi tujuh kolomnya NULL. Melahirkannya berisi bawaan
    // berarti PUT kosong diam-diam menjadi tujuh pilihan yang tidak pernah
    // dinyatakan siapa pun.
    const { base, baris } = await boot();

    const res = await simpan(base, await tokenUntuk(A), {});

    expect(res.status).toBe(200);
    expect(baris[0]).toMatchObject(ACCESSIBILITY_PROFILE_KOSONG);
  });

  it("A menyimpan preferensi, baris B tidak tersentuh", async () => {
    const { base, baris } = await boot({
      baris: [barisUntuk(A), barisUntuk(B, { textScale: 200 })],
    });

    await simpan(base, await tokenUntuk(A), { textScale: 120 });

    expect(baris.find((r) => r.userId === B)?.textScale).toBe(200);
  });

  it("userId di badan tidak bisa dipakai menulis milik orang lain", async () => {
    const { base, baris } = await boot({ baris: [barisUntuk(B, { textScale: 200 })] });

    // `.strict()` menolak field asing — jadi penyelundupan ini bahkan tidak
    // sampai ke service, apalagi ke baris B.
    const res = await simpan(base, await tokenUntuk(A), { userId: B, textScale: 120 });

    expect(res.status).toBe(400);
    expect(baris.find((r) => r.userId === B)?.textScale).toBe(200);
  });
});

describe("PUT /api/v1/me/accessibility — validasi (AC: pesan Bahasa Indonesia)", () => {
  it.each([
    ["textScale 99 (di bawah batas)", { textScale: 99 }],
    ["textScale 201 (di atas batas)", { textScale: 201 }],
    ["textScale bukan bilangan bulat", { textScale: 150.5 }],
    ["boolean salah tipe", { highContrast: "ya" }],
    ["field asing", { foo: "bar" }],
  ])("%s → 400 VALIDATION_ERROR", async (_nama, badan) => {
    const { base } = await boot();
    const res = await simpan(base, await tokenUntuk(A), badan);

    expect(res.status).toBe(400);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it.each([
    [100, "batas bawah"],
    [200, "batas atas — WCAG 1.4.4"],
  ])("textScale %i (%s) diterima", async (nilai) => {
    const { base } = await boot();
    const res = await simpan(base, await tokenUntuk(A), { textScale: nilai });
    expect(res.status).toBe(200);
  });

  it("pesan penolakan berbahasa Indonesia dan menyebut perbaikannya", async () => {
    const { base } = await boot();
    const res = await simpan(base, await tokenUntuk(A), { textScale: 400 });

    const body = (await res.json()) as { code: string; message: string; hint?: string };
    expect(body.message.length).toBeGreaterThan(0);
    expect(body.hint).toContain("maksimal 200");
  });

  it("badan ditolak → tidak ada baris yang tertulis", async () => {
    const { base, baris } = await boot();
    await simpan(base, await tokenUntuk(A), { textScale: 999 });
    expect(baris).toHaveLength(0);
  });
});

describe("penyediaan awal lewat event auth.user_registered", () => {
  it("event terbit → BARIS BAWAAN benar-benar tertulis di DB (bukan sekadar GET yang menjawab bawaan)", async () => {
    // Pembedaan ini yang membuat test-nya bermakna: `GET` menjawab bawaan pada
    // pengguna yang belum punya baris SEKALIPUN penyediaan tidak pernah
    // berjalan, jadi memeriksa response saja akan lulus di kedua keadaan.
    // Yang diperiksa adalah isi tabelnya.
    const { base, baris, events } = await boot();
    expect(baris).toHaveLength(0);

    events.emit("auth.user_registered", {
      userId: A,
      registeredAt: "2026-08-14T03:00:00.000Z",
    });
    await new Promise((r) => setImmediate(r));

    expect(baris).toHaveLength(1);
    expect(baris[0]).toMatchObject({ userId: A, ...ACCESSIBILITY_PROFILE_KOSONG });

    const body = (await (await ambil(base, "/me/accessibility", await tokenUntuk(A))).json()) as {
      data: unknown;
    };
    expect(body.data).toEqual(ACCESSIBILITY_PROFILE_KOSONG);
  });

  it("event terbit dua kali → tetap satu baris, dan preferensi pilihan pengguna tidak kembali ke bawaan", async () => {
    const { baris, events } = await boot({
      baris: [barisUntuk(A, { textScale: 200, highContrast: true })],
    });

    for (let i = 0; i < 2; i += 1) {
      events.emit("auth.user_registered", { userId: A, registeredAt: "2026-08-14T03:00:00.000Z" });
    }
    await new Promise((r) => setImmediate(r));

    expect(baris).toHaveLength(1);
    expect(baris[0]).toMatchObject({ textScale: 200, highContrast: true });
  });

  it("modul berlangganan tepat sekali", async () => {
    const { events } = await boot();
    expect(events.jumlahPelanggan("auth.user_registered")).toBe(1);
  });

  it("GET sebelum pelanggan sempat berjalan tetap 200 profil kosong, bukan 404", async () => {
    // Penerbit TIDAK menunggu pelanggan (lihat core/events), jadi jendela ini
    // memang ada. Yang tidak boleh terjadi adalah pengguna melihat kegagalan.
    const { base, events } = await boot();

    events.emit("auth.user_registered", { userId: A, registeredAt: "2026-08-14T03:00:00.000Z" });
    const res = await ambil(base, "/me/accessibility", await tokenUntuk(A));

    expect(res.status).toBe(200);
    expect((await res.json()) as { data: unknown }).toEqual({ data: ACCESSIBILITY_PROFILE_KOSONG });
  });
});

describe("deklarasi akses route (PR-019)", () => {
  it("kedua route terdaftar dan sama-sama menuntut sesi", async () => {
    const { registry } = await boot();

    const daftar = registry.list();
    expect(daftar.map((e) => `${e.method} ${e.path}`).sort()).toEqual([
      "GET /api/v1/me/accessibility",
      "PUT /api/v1/me/accessibility",
    ]);
    for (const entri of daftar) {
      expect(entri.access.kind).toBe("authenticated");
    }
  });
});
