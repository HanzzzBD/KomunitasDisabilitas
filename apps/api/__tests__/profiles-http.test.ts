// Integration HTTP profil pencari kerja (PR-037) — server Express nyata, token
// RS256 nyata, guard sesi dari registrar PR-019, enkripsi core/crypto NYATA.
//
// Yang dijaga file ini adalah kelima Acceptance Criteria PR-037:
//   AC-1 kolom sensitif tersimpan sebagai ciphertext (di sini: baris palsu yang
//        menerima persis apa yang akan dikirim Prisma; buktinya terhadap
//        PostgreSQL sungguhan ada di profiles-db.test.ts)
//   AC-2 tulis sensitif tanpa consent → 403 berbahasa sederhana
//   AC-3 cabut consent → field sensitif terhapus + audit
//   AC-4 pemilik membaca kembali datanya terdekripsi dengan benar
//   AC-5 taksonomi akomodasi tervalidasi zod (nilai liar ditolak)
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import {
  auditMetaSchemas,
  AUDIT_ACTION,
  SEEKER_PROFILE_KOSONG,
  seekerProfileSchema,
  type SeekerProfile,
  type UserRole,
} from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { parseFieldKeys } from "../src/core/crypto/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createProfilesModule } from "../src/modules/profiles/index.js";
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

/** Kunci dev-only deterministik — sama polanya dengan crypto.test.ts. */
const FIELD_KEYS = parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 7).toString("base64") });

/** Baris `seeker_profiles` apa adanya, termasuk kolom ciphertext. */
interface BarisProfil {
  userId: string;
  headline: string | null;
  summary: string | null;
  city: string | null;
  province: string | null;
  openToRemote: boolean;
  disclosureDefault: "never" | "ask_each_time" | "always";
  consentSensitiveAt: Date | null;
  disabilityTypes: Buffer | null;
  accommodationNeeds: Buffer | null;
}

/** Baris baru mengikuti `@default` schema.prisma — bukan nilai karangan test. */
function barisBaru(userId: string, overrides: Partial<BarisProfil> = {}): BarisProfil {
  return {
    userId,
    headline: null,
    summary: null,
    city: null,
    province: null,
    openToRemote: false,
    disclosureDefault: "ask_each_time",
    consentSensitiveAt: null,
    disabilityTypes: null,
    accommodationNeeds: null,
    ...overrides,
  };
}

/**
 * Prisma palsu: tabel `seeker_profiles` in-memory dengan `userId` sebagai kunci
 * primer — persis yang membuat `upsert()` cukup satu statement di repository.
 *
 * `$transaction` menjalankan callback dengan klien yang sama: cukup untuk
 * membuktikan URUTAN (baca consent lalu tulis, tanpa bolak-balik ke pemanggil),
 * tidak untuk membuktikan atomisitasnya. Yang terakhir hanya bisa dibuktikan
 * terhadap PostgreSQL sungguhan, dan memang tidak diklaim di sini.
 */
function fakePrisma(rows: BarisProfil[]) {
  type Patch = Partial<BarisProfil>;
  const ambil = (userId: string) => rows.find((r) => r.userId === userId);

  const seekerProfile = {
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
        const lahir = barisBaru(create.userId, create);
        rows.push(lahir);
        return Promise.resolve({ ...lahir });
      }
      Object.assign(baris, update);
      return Promise.resolve({ ...baris });
    },
  };

  const client = {
    seekerProfile,
    $transaction: <T>(fn: (tx: { seekerProfile: typeof seekerProfile }) => Promise<T>) =>
      fn({ seekerProfile }),
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

interface Jejak {
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
  requestId: string;
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot(options: { baris?: BarisProfil[] } = {}) {
  const env = testEnv();
  const baris = options.baris ?? [];
  const audit: Jejak[] = [];
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
        createProfilesModule({
          prisma: fakePrisma(baris),
          routes: registry.forModule("/api/v1"),
          fieldKeys: FIELD_KEYS,
          auditLog: (actor, action, entity, entityId, meta) => {
            audit.push({ action, entity, entityId, meta, requestId: actor.requestId });
          },
        }),
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, baris, audit, registry };
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
  return fetch(`${base}/me/profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function badan(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/me/profile — akses", () => {
  it("tanpa token → 401 TIDAK_TERAUTENTIKASI", async () => {
    const { base } = await boot();
    const res = await ambil(base, "/me/profile");

    expect(res.status).toBe(401);
    expect(await badan(res)).toMatchObject({ code: "TIDAK_TERAUTENTIKASI" });
  });

  it("token tanda tangan asing → 401 SESI_TIDAK_VALID", async () => {
    const { base } = await boot();
    const res = await ambil(base, "/me/profile", "bukan.token.sah");

    expect(res.status).toBe(401);
    expect(await badan(res)).toMatchObject({ code: "SESI_TIDAK_VALID" });
  });

  it("tidak ada route ber-param untuk menyebut pengguna lain → 404, bukan 403", async () => {
    // Isolasinya STRUKTURAL: bukan pemeriksaan yang menolak, melainkan saluran
    // yang tidak pernah dibuat. Route support ber-alasan lahir di PR-039.
    const { base } = await boot({ baris: [barisBaru(B, { headline: "milik B" })] });
    const token = await tokenUntuk(A);

    expect((await ambil(base, `/profile/${B}`, token)).status).toBe(404);
    expect((await ambil(base, `/me/profile/${B}`, token)).status).toBe(404);
  });
});

describe("GET /api/v1/me/profile — isi", () => {
  it("belum punya baris → 200 profil kosong, dan TIDAK ada baris yang lahir", async () => {
    const { base, baris } = await boot();
    const res = await ambil(base, "/me/profile", await tokenUntuk(A));

    expect(res.status).toBe(200);
    const body = await badan(res);
    expect(seekerProfileSchema.safeParse(body.data).success).toBe(true);
    expect(body.data).toEqual(SEEKER_PROFILE_KOSONG);
    // Endpoint baca tidak menulis apa pun.
    expect(baris).toHaveLength(0);
  });

  it("punya baris → nilai tersimpan, tanpa kolom internal", async () => {
    const { base } = await boot({
      baris: [barisBaru(A, { headline: "Desainer grafis", city: "Jakarta", openToRemote: true })],
    });
    const body = await badan(await ambil(base, "/me/profile", await tokenUntuk(A)));

    expect(body.data).toMatchObject({
      headline: "Desainer grafis",
      city: "Jakarta",
      openToRemote: true,
      sensitive: null,
    });
    for (const terlarang of ["userId", "profileEmbedding", "createdAt", "updatedAt"]) {
      expect(body.data).not.toHaveProperty(terlarang);
    }
  });

  it("token A tidak pernah melihat baris B (AC: isolasi antar pengguna)", async () => {
    const { base } = await boot({
      baris: [barisBaru(A, { headline: "punya A" }), barisBaru(B, { headline: "punya B" })],
    });

    const body = await badan(await ambil(base, "/me/profile", await tokenUntuk(A)));
    expect((body.data as SeekerProfile).headline).toBe("punya A");
  });
});

describe("PUT /api/v1/me/profile — bagian aman", () => {
  it("pengguna tanpa baris → baris lahir dengan bawaan schema.prisma", async () => {
    const { base, baris } = await boot();

    const res = await simpan(base, await tokenUntuk(A), { headline: "Penulis konten" });

    expect(res.status).toBe(200);
    expect((await badan(res)).data).toEqual({
      ...SEEKER_PROFILE_KOSONG,
      headline: "Penulis konten",
    });
    expect(baris).toHaveLength(1);
    expect(baris[0]?.userId).toBe(A);
  });

  it("patch sebagian tidak mengosongkan field lain", async () => {
    const { base } = await boot({ baris: [barisBaru(A, { headline: "lama", city: "Bandung" })] });

    const res = await simpan(base, await tokenUntuk(A), { city: "Yogyakarta" });

    expect((await badan(res)).data).toMatchObject({ headline: "lama", city: "Yogyakarta" });
  });

  it("null MENGOSONGKAN field, string kosong juga", async () => {
    const { base } = await boot({ baris: [barisBaru(A, { headline: "lama", summary: "lama" })] });

    const res = await simpan(base, await tokenUntuk(A), { headline: null, summary: "   " });

    expect((await badan(res)).data).toMatchObject({ headline: null, summary: null });
  });

  it("A menyimpan profil, baris B tidak tersentuh", async () => {
    const { base, baris } = await boot({
      baris: [barisBaru(A), barisBaru(B, { headline: "punya B" })],
    });

    await simpan(base, await tokenUntuk(A), { headline: "punya A" });

    expect(baris.find((r) => r.userId === B)?.headline).toBe("punya B");
  });

  it("userId di badan tidak bisa dipakai menulis milik orang lain", async () => {
    const { base, baris } = await boot({ baris: [barisBaru(B, { headline: "punya B" })] });

    const res = await simpan(base, await tokenUntuk(A), { userId: B, headline: "disusupkan" });

    expect(res.status).toBe(400);
    expect(baris.find((r) => r.userId === B)?.headline).toBe("punya B");
  });
});

describe("PUT /api/v1/me/profile — gerbang consent (AC-2)", () => {
  const SENSITIF = { disabilityTypes: ["netra"], accommodationNeeds: { tags: [], notes: null } };

  it("tulis sensitif tanpa consent → 403 dengan pesan sederhana, dan TIDAK ada baris yang lahir", async () => {
    const { base, baris, audit } = await boot();

    const res = await simpan(base, await tokenUntuk(A), SENSITIF);

    expect(res.status).toBe(403);
    const body = await badan(res);
    expect(body).toMatchObject({ code: "CONSENT_SENSITIF_DIPERLUKAN" });
    // Pesannya menjelaskan langkah berikutnya, bukan menuduh.
    expect(String(body.message)).not.toContain("tidak berhak");
    expect(String(body.hint)).toContain("persetujuan");
    // Penolakan terjadi SEBELUM satu byte pun tertulis.
    expect(baris).toHaveLength(0);
    expect(audit).toHaveLength(0);
  });

  it("baris sudah ada tetapi consent belum → 403, kolom sensitif tetap kosong", async () => {
    const { base, baris } = await boot({ baris: [barisBaru(A, { headline: "ada" })] });

    const res = await simpan(base, await tokenUntuk(A), SENSITIF);

    expect(res.status).toBe(403);
    expect(baris[0]?.disabilityTypes).toBeNull();
    expect(baris[0]?.accommodationNeeds).toBeNull();
  });

  it("consent + data sensitif dalam SATU permintaan diterima", async () => {
    // Inilah bentuk formulirnya (PR-040): centang persetujuan lalu simpan.
    // Memaksa dua permintaan berurutan hanya akan melahirkan keadaan setengah
    // jadi saat yang kedua gagal.
    const { base } = await boot();

    const res = await simpan(base, await tokenUntuk(A), { consentSensitive: true, ...SENSITIF });

    expect(res.status).toBe(200);
    expect((await badan(res)).data).toMatchObject({
      sensitive: { disabilityTypes: ["netra"] },
    });
  });

  it("consent dulu, data menyusul di permintaan kedua", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    expect((await simpan(base, token, { consentSensitive: true })).status).toBe(200);
    const res = await simpan(base, token, SENSITIF);

    expect(res.status).toBe(200);
  });

  it("menghapus field sensitif (null) TIDAK butuh consent", async () => {
    // Menghapus bukan menyimpan. Menuntut izin menyimpan untuk boleh menghapus
    // akan mengunci data seseorang di dalam platform justru saat ia ingin keluar.
    const { base } = await boot({ baris: [barisBaru(A)] });

    const res = await simpan(base, await tokenUntuk(A), { disabilityTypes: null });

    expect(res.status).toBe(200);
  });

  it("waktu consent tidak ditimpa saat formulir disimpan lagi", async () => {
    const semula = new Date("2026-08-01T03:00:00.000Z");
    const { base, baris } = await boot({
      baris: [barisBaru(A, { consentSensitiveAt: semula })],
    });

    await simpan(base, await tokenUntuk(A), { consentSensitive: true, headline: "baru" });

    expect(baris[0]?.consentSensitiveAt).toEqual(semula);
  });
});

describe("PUT /api/v1/me/profile — enkripsi & roundtrip (AC-1, AC-4)", () => {
  const ISI = {
    consentSensitive: true,
    disabilityTypes: ["tuli", "daksa"],
    accommodationNeeds: {
      tags: ["juru_bahasa_isyarat", "akses_kursi_roda"],
      notes: "Butuh pendamping saat wawancara luring",
    },
  };

  it("kolom sensitif yang dikirim ke DB adalah CIPHERTEXT, bukan teks terbaca", async () => {
    const { base, baris } = await boot();

    await simpan(base, await tokenUntuk(A), ISI);

    const row = baris[0];
    expect(Buffer.isBuffer(row?.disabilityTypes)).toBe(true);
    expect(Buffer.isBuffer(row?.accommodationNeeds)).toBe(true);
    // Tidak satu pun nilai plaintext boleh muncul di byte yang tersimpan.
    const tersimpan = Buffer.concat([
      row?.disabilityTypes ?? Buffer.alloc(0),
      row?.accommodationNeeds ?? Buffer.alloc(0),
    ]).toString("latin1");
    for (const bocor of ["tuli", "daksa", "juru_bahasa_isyarat", "pendamping"]) {
      expect(tersimpan).not.toContain(bocor);
    }
  });

  it("pemilik membaca kembali datanya terdekripsi dengan benar", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    await simpan(base, token, ISI);
    const body = await badan(await ambil(base, "/me/profile", token));

    expect(seekerProfileSchema.safeParse(body.data).success).toBe(true);
    expect((body.data as SeekerProfile).sensitive).toEqual({
      disabilityTypes: ["tuli", "daksa"],
      accommodationNeeds: ISI.accommodationNeeds,
    });
  });

  it("consent diberikan tetapi belum ada isi → sensitive kosong, bukan null", async () => {
    // Bentuk kosong harus sama dengan bentuk terisi supaya UI tidak butuh
    // cabang ketiga di antara "belum consent" dan "sudah ada isinya".
    const { base } = await boot();
    const token = await tokenUntuk(A);

    await simpan(base, token, { consentSensitive: true });
    const body = await badan(await ambil(base, "/me/profile", token));

    expect((body.data as SeekerProfile).sensitive).toEqual({
      disabilityTypes: [],
      accommodationNeeds: { tags: [], notes: null },
    });
  });
});

describe("PUT /api/v1/me/profile — pencabutan consent (AC-3)", () => {
  async function bootDenganIsi() {
    const konteks = await boot();
    const token = await tokenUntuk(A);
    await simpan(konteks.base, token, {
      consentSensitive: true,
      disabilityTypes: ["autisme"],
      accommodationNeeds: { tags: ["ruang_kerja_tenang"], notes: "hindari open space" },
    });
    konteks.audit.length = 0; // hanya jejak pencabutan yang diperiksa di bawah
    return { ...konteks, token };
  }

  it("cabut consent → kedua kolom sensitif benar-benar NULL di DB", async () => {
    const { base, baris, token } = await bootDenganIsi();

    const res = await simpan(base, token, { consentSensitive: false });

    expect(res.status).toBe(200);
    expect(baris[0]?.disabilityTypes).toBeNull();
    expect(baris[0]?.accommodationNeeds).toBeNull();
    expect(baris[0]?.consentSensitiveAt).toBeNull();
  });

  it("cabut consent → response dan GET berikutnya menjawab sensitive: null", async () => {
    const { base, token } = await bootDenganIsi();

    const res = await simpan(base, token, { consentSensitive: false });
    expect(((await badan(res)).data as SeekerProfile).sensitive).toBeNull();

    const body = await badan(await ambil(base, "/me/profile", token));
    expect((body.data as SeekerProfile).sensitive).toBeNull();
    expect((body.data as SeekerProfile).consentSensitiveAt).toBeNull();
  });

  it("cabut consent → satu baris audit consentRevoked yang lolos katalog", async () => {
    const { base, audit, token } = await bootDenganIsi();

    await simpan(base, token, { consentSensitive: false });

    expect(audit).toHaveLength(1);
    const jejak = audit[0];
    expect(jejak?.action).toBe(AUDIT_ACTION.PROFILE_SENSITIVE_UPDATED);
    expect(jejak?.entity).toBe("profiles.seeker");
    expect(jejak?.entityId).toBe(A);
    expect(jejak?.meta).toEqual({
      operation: "consentRevoked",
      fields: ["disabilityTypes", "accommodationNeeds"],
    });
  });

  it("bagian aman profil TIDAK ikut terhapus saat consent dicabut", async () => {
    // Pencabutan consent adalah penarikan izin atas SATU kelas data, bukan
    // penghapusan akun. Menghapus headline/kota bersamanya akan menghukum
    // orang karena memakai haknya.
    const { base, token } = await bootDenganIsi();
    await simpan(base, token, { headline: "Analis QA", city: "Bandung" });

    const res = await simpan(base, token, { consentSensitive: false });

    expect(((await badan(res)).data as SeekerProfile).headline).toBe("Analis QA");
  });

  it("cabut consent dua kali → yang kedua tidak menulis audit lagi", async () => {
    const { base, audit, token } = await bootDenganIsi();

    await simpan(base, token, { consentSensitive: false });
    audit.length = 0;
    const res = await simpan(base, token, { consentSensitive: false });

    expect(res.status).toBe(200);
    expect(audit).toHaveLength(0);
  });
});

describe("PUT /api/v1/me/profile — audit (katalog PR-014)", () => {
  it("consent + isi dalam satu permintaan → DUA baris ber-requestId sama", async () => {
    const { base, audit } = await boot();

    await simpan(base, await tokenUntuk(A), {
      consentSensitive: true,
      disabilityTypes: ["netra"],
    });

    expect(audit.map((j) => (j.meta as { operation: string }).operation)).toEqual([
      "consentGranted",
      "fieldsUpdated",
    ]);
    expect(new Set(audit.map((j) => j.requestId)).size).toBe(1);
  });

  it("setiap meta yang ditulis lolos sanitizer katalog (bukan sekadar bentuk bebas)", async () => {
    // Meta yang tidak lolos akan DIBUANG diam-diam oleh core/audit di produksi:
    // endpoint tetap 200, dan jejaknya tidak pernah ada. Memeriksanya di sini
    // adalah satu-satunya tempat kegagalan itu bisa terlihat.
    const { base, audit } = await boot();
    const token = await tokenUntuk(A);

    await simpan(base, token, { consentSensitive: true, disabilityTypes: ["netra"] });
    await simpan(base, token, { consentSensitive: false });

    expect(audit.length).toBeGreaterThan(0);
    for (const jejak of audit) {
      const skema = auditMetaSchemas[AUDIT_ACTION.PROFILE_SENSITIVE_UPDATED];
      expect(skema.safeParse(jejak.meta).success, JSON.stringify(jejak.meta)).toBe(true);
    }
  });

  it("meta audit TIDAK pernah memuat nilai disabilitas atau catatan akomodasi", async () => {
    const { base, audit } = await boot();

    await simpan(base, await tokenUntuk(A), {
      consentSensitive: true,
      disabilityTypes: ["autisme"],
      accommodationNeeds: { tags: ["ruang_kerja_tenang"], notes: "rahasia-sekali" },
    });

    const serial = JSON.stringify(audit);
    for (const bocor of ["autisme", "ruang_kerja_tenang", "rahasia-sekali"]) {
      expect(serial).not.toContain(bocor);
    }
  });

  it("menyimpan bagian aman saja TIDAK menulis audit", async () => {
    // Jejak yang terbit setiap kali formulir disimpan akan menenggelamkan
    // jejak yang memang perlu jarang.
    const { base, audit } = await boot();

    await simpan(base, await tokenUntuk(A), { headline: "Penulis", city: "Solo" });

    expect(audit).toHaveLength(0);
  });

  it("MEMBACA profil sendiri tidak menulis audit", async () => {
    const { base, audit } = await boot({ baris: [barisBaru(A)] });

    await ambil(base, "/me/profile", await tokenUntuk(A));

    expect(audit).toHaveLength(0);
  });
});

describe("PUT /api/v1/me/profile — validasi taksonomi (AC-5)", () => {
  it.each([
    ["ragam disabilitas liar", { consentSensitive: true, disabilityTypes: ["tuna_rungu"] }],
    ["ragam disabilitas bukan array", { consentSensitive: true, disabilityTypes: "netra" }],
    [
      "tag akomodasi liar",
      { consentSensitive: true, accommodationNeeds: { tags: ["kursi_pijat"], notes: null } },
    ],
    [
      "akomodasi tanpa field wajib",
      { consentSensitive: true, accommodationNeeds: { tags: ["ruang_kerja_tenang"] } },
    ],
    ["disclosureDefault liar", { disclosureDefault: "kadang" }],
    ["headline melebihi 120 karakter", { headline: "x".repeat(121) }],
    ["catatan akomodasi melebihi 500 karakter", { accommodationNeeds: { tags: [], notes: "y".repeat(501) } }],
    ["field asing", { foo: "bar" }],
  ])("%s → 400 VALIDATION_ERROR", async (_nama, body) => {
    const { base, baris } = await boot();
    const res = await simpan(base, await tokenUntuk(A), body);

    expect(res.status).toBe(400);
    expect(await badan(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    // Badan ditolak → tidak ada baris yang tertulis.
    expect(baris).toHaveLength(0);
  });

  it("mencabut consent sambil menyimpan data sensitif → 400, bukan salah satunya diam-diam", async () => {
    const { base } = await boot();
    const res = await simpan(base, await tokenUntuk(A), {
      consentSensitive: false,
      disabilityTypes: ["netra"],
    });

    expect(res.status).toBe(400);
    expect(String((await badan(res)).hint)).toContain("mencabut persetujuan");
  });

  it("pilihan taksonomi ganda dirapikan, bukan ditolak", async () => {
    // Daftar ini datang dari kotak centang; duplikat berarti klien salah
    // merakit badan — dan menolaknya hanya menyisakan pengguna di depan
    // formulir yang tidak bisa ia perbaiki. Nilai LIAR tetap ditolak (di atas).
    const { base } = await boot();
    const res = await simpan(base, await tokenUntuk(A), {
      consentSensitive: true,
      disabilityTypes: ["tuli", "tuli", "netra"],
    });

    expect(res.status).toBe(200);
    expect(((await badan(res)).data as SeekerProfile).sensitive?.disabilityTypes).toEqual([
      "tuli",
      "netra",
    ]);
  });

  it("seluruh nilai taksonomi yang didokumentasikan benar-benar diterima", async () => {
    // Penjaga arah sebaliknya: enum yang menyempit tanpa sengaja akan membuat
    // pilihan yang ditampilkan UI (PR-040) ditolak server tanpa gejala lain.
    const { base } = await boot();
    const res = await simpan(base, await tokenUntuk(A), {
      consentSensitive: true,
      disabilityTypes: ["tuli", "netra", "daksa", "autisme", "lainnya"],
      accommodationNeeds: {
        tags: [
          "akses_kursi_roda",
          "ramah_screen_reader",
          "wawancara_via_teks",
          "jam_kerja_fleksibel",
          "ruang_kerja_tenang",
          "juru_bahasa_isyarat",
        ],
        notes: null,
      },
    });

    expect(res.status).toBe(200);
  });
});

describe("deklarasi akses route (PR-019)", () => {
  it("kedua route terdaftar dan sama-sama menuntut sesi", async () => {
    const { registry } = await boot();

    const daftar = registry.list();
    expect(daftar.map((e) => `${e.method} ${e.path}`).sort()).toEqual([
      "GET /api/v1/me/profile",
      "PUT /api/v1/me/profile",
    ]);
    for (const entri of daftar) {
      expect(entri.access.kind).toBe("authenticated");
    }
  });
});
