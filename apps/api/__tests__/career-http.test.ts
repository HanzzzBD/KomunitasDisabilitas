// Integration HTTP sub-entitas karier (PR-038) — server Express nyata, token
// RS256 nyata, guard sesi dari registrar PR-019.
//
// Yang dijaga file ini adalah kelima Acceptance Criteria PR-038:
//   AC-1 CRUD ketiganya lengkap + otorisasi (milik orang lain = tidak ada)
//   AC-2 `profile.updated` terbit pada SETIAP mutasi (assert event)
//   AC-3 validasi tanggal & panjang teks
//   AC-4 urutan bawaan masuk akal — dibuktikan terhadap PostgreSQL sungguhan di
//        career-db.test.ts, sebab urutannya milik `orderBy` yang tabel palsu di
//        sini tidak menjalankan
//   AC-5 cascade delete saat akun dihapus — juga di career-db.test.ts, karena
//        yang menjalankannya adalah PostgreSQL, bukan kode
//
// TABEL PALSU DI SINI MENGABAIKAN `select`, DAN ITU DISENGAJA. Baris yang
// kembali karenanya membawa `userId` — kolom yang TIDAK boleh muncul di
// response. Fake yang menghormati `select` akan menyembunyikannya dan membuat
// pemetaan eksplisit di service tampak tidak perlu diuji.
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import type { ProfileUpdatedEvent, UserRole } from "@nawasena/schemas";
import { educationSchema, experienceSchema, skillSchema } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { parseFieldKeys } from "../src/core/crypto/index.js";
import { createEventBus } from "../src/core/events/index.js";
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
/** UUID yang bentuknya sah tetapi tidak dimiliki siapa pun. */
const HANTU = "018f4c1e-0000-7000-8000-00000000cccc";

const tokens = createTokenService(SESSION_KEYS);
const FIELD_KEYS = parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 7).toString("base64") });

type Baris = Record<string, unknown> & { id: string; userId: string };

/**
 * Satu tabel karier in-memory.
 *
 * `orderBy` diabaikan — urutan bawaan diuji terhadap DB sungguhan. Yang ditiru
 * dengan setia justru hal lain: `updateMany`/`deleteMany` menyaring dengan
 * SELURUH klausa `where`, termasuk `userId`. Itulah satu-satunya hal yang
 * menghalangi seseorang menyentuh baris orang lain, jadi fake yang hanya
 * mencocokkan `id` akan membuat test kepemilikan di bawah lulus secara palsu.
 */
function tabel(rows: Baris[]) {
  const cocok = (where: Record<string, unknown>) => (r: Baris) =>
    Object.entries(where).every(([k, v]) => r[k] === v);

  return {
    findMany: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(rows.filter(cocok(where)).map((r) => ({ ...r }))),
    findFirst: ({ where }: { where: Record<string, unknown> }) => {
      const found = rows.find(cocok(where));
      return Promise.resolve(found === undefined ? null : { ...found });
    },
    create: ({ data }: { data: Baris }) => {
      rows.push({ ...data });
      return Promise.resolve({ ...data });
    },
    updateMany: ({ where, data }: { where: Record<string, unknown>; data: Partial<Baris> }) => {
      const kena = rows.filter(cocok(where));
      for (const r of kena) Object.assign(r, data);
      return Promise.resolve({ count: kena.length });
    },
    deleteMany: ({ where }: { where: Record<string, unknown> }) => {
      const kena = rows.filter(cocok(where));
      for (const r of kena) rows.splice(rows.indexOf(r), 1);
      return Promise.resolve({ count: kena.length });
    },
  };
}

function fakePrisma(isi: { experience: Baris[]; education: Baris[]; skill: Baris[] }) {
  const seekerProfile = {
    findUnique: () => Promise.resolve(null),
    upsert: ({ create }: { create: Record<string, unknown> }) => Promise.resolve(create),
  };
  // Penjaga consent (PR-039) membaca lewat `SELECT … FOR UPDATE`. Berkas ini
  // tidak menguji jalur sensitif sama sekali — profilnya selalu kosong — jadi
  // kueri itu cukup dijawab "tidak ada baris".
  const queryRaw = () => Promise.resolve([]);
  const client = {
    seekerProfile,
    experience: tabel(isi.experience),
    education: tabel(isi.education),
    skill: tabel(isi.skill),
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn({ seekerProfile, $queryRaw: queryRaw }),
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

async function boot(
  isi: Partial<{ experience: Baris[]; education: Baris[]; skill: Baris[] }> = {},
) {
  const env = testEnv();
  const data = {
    experience: isi.experience ?? [],
    education: isi.education ?? [],
    skill: isi.skill ?? [],
  };
  const logger = createLogger(env, {
    destination: new Writable({
      write(_chunk, _e, cb) {
        cb();
      },
    }),
  });

  // Bus NYATA dengan satu pelanggan, bukan `vi.fn()` atas `emit`: yang ingin
  // dibuktikan adalah bahwa pelanggan sungguhan menerima payload yang benar,
  // dan mata-mata atas emit membuktikan pemanggilan tanpa membuktikan itu.
  const events = createEventBus({ logger });
  const terbit: ProfileUpdatedEvent[] = [];
  events.on("profile.updated", (payload) => {
    terbit.push(payload);
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
          prisma: fakePrisma(data),
          routes: registry.forModule("/api/v1"),
          fieldKeys: FIELD_KEYS,
          auditLog: () => {},
          events,
        }).router,
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, data, terbit };
}

async function tokenUntuk(userId: string): Promise<string> {
  return tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 });
}

function panggil(base: string, method: string, path: string, token?: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function badan(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Ketiga entitas menjalani pemeriksaan akses & kepemilikan yang sama. */
const ENTITAS = [
  {
    nama: "experiences" as const,
    path: "/me/experiences",
    contoh: { title: "Analis Data" },
    ubah: { title: "Analis Data Senior" },
    skema: experienceSchema,
  },
  {
    nama: "educations" as const,
    path: "/me/educations",
    contoh: { institution: "Universitas Indonesia" },
    ubah: { institution: "Universitas Gadjah Mada" },
    skema: educationSchema,
  },
  {
    nama: "skills" as const,
    path: "/me/skills",
    contoh: { name: "SQL" },
    ubah: { name: "PostgreSQL" },
    skema: skillSchema,
  },
];

describe("akses (PR-019) — seluruh route sub-entitas menuntut sesi", () => {
  for (const e of ENTITAS) {
    it(`${e.path} tanpa token → 401 pada keempat metode`, async () => {
      const { base } = await boot();

      for (const [method, path, body] of [
        ["GET", e.path, undefined],
        ["POST", e.path, e.contoh],
        ["PUT", `${e.path}/${HANTU}`, e.ubah],
        ["DELETE", `${e.path}/${HANTU}`, undefined],
      ] as const) {
        const res = await panggil(base, method, path, undefined, body);
        expect(res.status, `${method} ${path}`).toBe(401);
        expect(await badan(res)).toMatchObject({ code: "TIDAK_TERAUTENTIKASI" });
      }
    });
  }
});

describe("CRUD lengkap (AC-1)", () => {
  for (const e of ENTITAS) {
    it(`${e.path} — buat, baca, ubah, hapus`, async () => {
      const { base } = await boot();
      const token = await tokenUntuk(A);

      expect(await badan(await panggil(base, "GET", e.path, token))).toEqual({ data: [] });

      const dibuat = await panggil(base, "POST", e.path, token, e.contoh);
      expect(dibuat.status).toBe(201);
      const item = (await badan(dibuat)).data as Record<string, unknown>;
      // Lolos kontrak zod yang SAMA dengan yang dipakai klien (PR-040).
      expect(() => e.skema.parse(item)).not.toThrow();
      // `userId` ikut terbawa dari tabel palsu; pemetaan eksplisit di service
      // yang menahannya. Kalau ia muncul di sini, response berikutnya yang
      // membawa kolom baru akan membocorkannya tanpa satu pun sinyal.
      expect(item).not.toHaveProperty("userId");

      const id = item.id as string;
      const daftar = (await badan(await panggil(base, "GET", e.path, token))).data as unknown[];
      expect(daftar).toHaveLength(1);

      const diubah = await panggil(base, "PUT", `${e.path}/${id}`, token, e.ubah);
      expect(diubah.status).toBe(200);
      expect((await badan(diubah)).data).toMatchObject({ id, ...e.ubah });

      const dihapus = await panggil(base, "DELETE", `${e.path}/${id}`, token);
      expect(dihapus.status).toBe(204);
      expect(await dihapus.text()).toBe("");
      expect(await badan(await panggil(base, "GET", e.path, token))).toEqual({ data: [] });
    });
  }
});

describe("kepemilikan (AC-1) — milik orang lain berperilaku seperti tidak ada", () => {
  for (const e of ENTITAS) {
    it(`${e.path} — daftar, ubah, dan hapus tidak pernah menjangkau baris B`, async () => {
      const milikB: Baris = { id: HANTU, userId: B, ...e.contoh };
      const { base, data } = await boot({ [e.nama === "experiences" ? "experience" : e.nama === "educations" ? "education" : "skill"]: [milikB] });
      const token = await tokenUntuk(A);

      // Daftar A kosong meski tabelnya berisi.
      expect(await badan(await panggil(base, "GET", e.path, token))).toEqual({ data: [] });

      // 404, BUKAN 403: jawaban yang membedakan keduanya memberi tahu penebak
      // UUID bahwa id yang ia coba benar-benar ada.
      const ubah = await panggil(base, "PUT", `${e.path}/${HANTU}`, token, e.ubah);
      expect(ubah.status).toBe(404);
      expect(await badan(ubah)).toMatchObject({ code: "RUTE_TIDAK_DITEMUKAN" });

      const hapus = await panggil(base, "DELETE", `${e.path}/${HANTU}`, token);
      expect(hapus.status).toBe(404);

      // Dan barisnya benar-benar tidak tersentuh.
      const semua = [...data.experience, ...data.education, ...data.skill];
      expect(semua).toHaveLength(1);
      expect(semua[0]).toMatchObject({ userId: B, ...e.contoh });
    });
  }

  it("id yang bukan UUID ditolak 400 di gerbang, bukan diteruskan ke Prisma", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const res = await panggil(base, "DELETE", "/me/skills/bukan-uuid", token);

    expect(res.status).toBe(400);
    expect(await badan(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("event profile.updated (AC-2)", () => {
  it("terbit pada create, update, DAN delete — tidak pada baca", async () => {
    const { base, terbit } = await boot();
    const token = await tokenUntuk(A);

    await panggil(base, "GET", "/me/skills", token);
    expect(terbit).toHaveLength(0);

    const dibuat = await panggil(base, "POST", "/me/skills", token, { name: "SQL" });
    const id = ((await badan(dibuat)).data as { id: string }).id;
    await panggil(base, "PUT", `/me/skills/${id}`, token, { level: "mahir" });
    await panggil(base, "DELETE", `/me/skills/${id}`, token);

    expect(terbit.map((e) => e.section)).toEqual(["skills", "skills", "skills"]);
    for (const e of terbit) {
      expect(e.userId).toBe(A);
      expect(Date.parse(e.updatedAt)).not.toBeNaN();
    }
  });

  it("bagian yang terbit mengikuti entitas yang berubah", async () => {
    const { base, terbit } = await boot();
    const token = await tokenUntuk(A);

    await panggil(base, "POST", "/me/experiences", token, { title: "Analis" });
    await panggil(base, "POST", "/me/educations", token, { institution: "UI" });
    await panggil(base, "PUT", "/me/profile", token, { headline: "Analis data" });

    expect(terbit.map((e) => e.section)).toEqual(["experiences", "educations", "profile"]);
  });

  it("mutasi yang GAGAL tidak menerbitkan apa pun", async () => {
    // Pelanggan yang menghitung ulang embedding dari perubahan yang tidak
    // pernah terjadi akan menyimpan hasil yang tidak ada di tabel mana pun.
    const { base, terbit } = await boot();
    const token = await tokenUntuk(A);

    await panggil(base, "PUT", `/me/skills/${HANTU}`, token, { name: "SQL" });
    await panggil(base, "DELETE", `/me/skills/${HANTU}`, token);
    await panggil(base, "POST", "/me/skills", token, { name: "" });

    expect(terbit).toHaveLength(0);
  });
});

describe("validasi (AC-3)", () => {
  it("tanggal selesai mendahului mulai ditolak dalam satu permintaan", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const res = await panggil(base, "POST", "/me/experiences", token, {
      title: "Analis",
      startDate: "2022-01-01",
      endDate: "2021-12-31",
    });

    expect(res.status).toBe(400);
    expect(await badan(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("tanggal selesai mendahului mulai juga ditolak saat dikirim TERPISAH", async () => {
    // Inilah yang tidak bisa dilihat skema: badan permintaan hanya memuat
    // `endDate`, dan `startDate` yang dibandingkan dengannya ada di baris yang
    // sudah tersimpan. Tanpa pemeriksaan gabungan di service, dua permintaan
    // yang masing-masing sah menghasilkan baris yang tidak sah.
    const { base } = await boot();
    const token = await tokenUntuk(A);
    const dibuat = await panggil(base, "POST", "/me/experiences", token, {
      title: "Analis",
      startDate: "2022-01-01",
    });
    const id = ((await badan(dibuat)).data as { id: string }).id;

    const res = await panggil(base, "PUT", `/me/experiences/${id}`, token, {
      endDate: "2021-12-31",
    });

    expect(res.status).toBe(400);
    expect(await badan(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("tanggal yang tidak ada di kalender ditolak", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const res = await panggil(base, "POST", "/me/experiences", token, {
      title: "Analis",
      startDate: "2026-02-31",
    });

    expect(res.status).toBe(400);
  });

  it("teks melewati batas panjangnya ditolak", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const res = await panggil(base, "POST", "/me/skills", token, { name: "x".repeat(81) });

    expect(res.status).toBe(400);
  });

  it("field asing ditolak, bukan dibuang diam-diam", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const res = await panggil(base, "POST", "/me/skills", token, {
      name: "SQL",
      userId: B, // percobaan menitipkan pemilik lewat badan permintaan
    });

    expect(res.status).toBe(400);
  });

  it("tahun pendidikan di luar batas ditolak", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    for (const year of [1949, 9999]) {
      const res = await panggil(base, "POST", "/me/educations", token, {
        institution: "UI",
        year,
      });
      expect(res.status, `year=${String(year)}`).toBe(400);
    }
  });
});

describe("bentuk jawaban", () => {
  it("field opsional yang tidak dikirim menjadi null, bukan hilang", async () => {
    // Klien (PR-040) merender formulir dari bentuk ini. Field yang HILANG dan
    // field yang bernilai null terbaca berbeda oleh React Hook Form: yang
    // pertama membuat input berubah dari uncontrolled menjadi controlled saat
    // pengguna mengetik.
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const res = await panggil(base, "POST", "/me/experiences", token, { title: "Analis" });

    expect((await badan(res)).data).toMatchObject({
      title: "Analis",
      company: null,
      startDate: null,
      endDate: null,
      description: null,
    });
  });

  it("tanggal kembali sebagai YYYY-MM-DD, bukan timestamp", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const res = await panggil(base, "POST", "/me/experiences", token, {
      title: "Analis",
      startDate: "2020-01-15",
      endDate: null,
    });

    expect((await badan(res)).data).toMatchObject({ startDate: "2020-01-15", endDate: null });
  });

  it("id dibuat server — id yang dikirim klien ditolak sebagai field asing", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const res = await panggil(base, "POST", "/me/skills", token, { name: "SQL", id: HANTU });

    expect(res.status).toBe(400);
  });
});
