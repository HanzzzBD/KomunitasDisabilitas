// Integration HTTP CV (PR-060) — server Express nyata, token RS256 nyata, guard
// sesi dari registrar PR-019.
//
// Yang dijaga berkas ini, mengikuti Acceptance Criteria PR-060:
//   AC-1 CRUD lengkap + otorisasi (CV orang lain = CV yang tidak ada)
//   AC-2 struktur invalid ditolak dengan pesan per-field sederhana
//   AC-3 batas CV ditegakkan lewat endpoint, bukan hanya di service
//   AC-5 `created_via` terisi `manual`, dan klien tidak bisa mengakuinya
//
// TABEL PALSU DI SINI MENGABAIKAN `select`, DAN ITU DISENGAJA — alasan yang sama
// persis dengan `career-http.test.ts`: baris yang kembali karenanya membawa
// `userId`, kolom yang TIDAK boleh muncul di response. Fake yang menghormati
// `select` akan menyembunyikannya dan membuat pemetaan eksplisit di service
// tampak tidak perlu diuji.
//
// Yang ditiru dengan setia justru hal lain: `updateMany`/`deleteMany`/`count`
// menyaring dengan SELURUH klausa `where`, termasuk `userId`. Di situlah letak
// satu-satunya penghalang seseorang menyentuh CV orang lain, jadi fake yang
// hanya mencocokkan `id` akan membuat test kepemilikan di bawah lulus palsu.
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import type { UserRole } from "@nawasena/schemas";
import { resumeSchema, resumeSummarySchema } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import {
  createResumesModule,
  type ResumesModuleDeps,
} from "../src/modules/resumes/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
  type RouteRegistry,
} from "../src/core/auth/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
/** UUID yang bentuknya sah tetapi tidak dimiliki siapa pun. */
const HANTU = "018f4c1e-0000-7000-8000-00000000cccc";

const tokens = createTokenService(SESSION_KEYS);

type Baris = Record<string, unknown> & { id: string; userId: string };

function tabelResume(rows: Baris[]) {
  const cocok = (where: Record<string, unknown>) => (r: Baris) =>
    Object.entries(where).every(([k, v]) => r[k] === v);

  return {
    findMany: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(rows.filter(cocok(where)).map((r) => ({ ...r }))),
    findFirst: ({ where }: { where: Record<string, unknown> }) => {
      const found = rows.find(cocok(where));
      return Promise.resolve(found === undefined ? null : { ...found });
    },
    count: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(rows.filter(cocok(where)).length),
    create: ({ data }: { data: Baris }) => {
      // Stempel waktu diisi database sungguhan (`@default(now())`,
      // `@updatedAt`); fake harus mengisinya juga, sebab pemetaan service
      // memanggil `.toISOString()` atasnya.
      const baris = { createdAt: new Date(), updatedAt: new Date(), pdfUrl: null, ...data };
      rows.push(baris);
      return Promise.resolve({ ...baris });
    },
    updateMany: ({ where, data }: { where: Record<string, unknown>; data: Partial<Baris> }) => {
      const kena = rows.filter(cocok(where));
      for (const r of kena) Object.assign(r, data, { updatedAt: new Date() });
      return Promise.resolve({ count: kena.length });
    },
    deleteMany: ({ where }: { where: Record<string, unknown> }) => {
      const kena = rows.filter(cocok(where));
      for (const r of kena) rows.splice(rows.indexOf(r), 1);
      return Promise.resolve({ count: kena.length });
    },
  };
}

function fakePrisma(rows: Baris[]) {
  const resume = tabelResume(rows);
  // `createIfUnderLimit` membungkus hitung+tulis dalam satu transaksi di belakang
  // `pg_advisory_xact_lock`. Kuncinya hanya berarti di PostgreSQL sungguhan —
  // dibuktikan `resumes-db.test.ts`; di sini ia cukup dijawab tanpa melakukan
  // apa pun, sebab Node menjalankan test ini dalam satu utas dan tidak ada yang
  // perlu diserialkan.
  const $executeRaw = () => Promise.resolve(0);
  const client = {
    resume,
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn({ resume, $executeRaw }),
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

interface BootOpsi {
  baris?: Baris[];
  maksPerPengguna?: number;
  pdf?: ResumesModuleDeps["pdf"];
}

async function boot(
  opsi: BootOpsi = {},
): Promise<{ base: string; rows: Baris[]; registry: RouteRegistry }> {
  const env = testEnv();
  const rows = opsi.baris ?? [];
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
        createResumesModule({
          prisma: fakePrisma(rows),
          routes: registry.forModule("/api/v1"),
          maksPerPengguna: opsi.maksPerPengguna ?? 5,
          pdf: opsi.pdf,
        }).router,
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, rows, registry };
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

/** Baris CV milik seseorang, seperti yang ditulis endpoint POST. */
function barisCv(patch: Partial<Baris> = {}): Baris {
  return {
    id: HANTU,
    userId: B,
    title: "CV Milik Orang Lain",
    content: { schemaVersion: 1 },
    pdfUrl: null,
    createdVia: "manual",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

describe("akses (PR-019) — seluruh route CV menuntut sesi", () => {
  it("tanpa token → 401 pada kelima route", async () => {
    const { base } = await boot();

    for (const [method, path, body] of [
      ["GET", "/me/resumes", undefined],
      ["POST", "/me/resumes", { title: "CV Baru" }],
      ["GET", `/me/resumes/${HANTU}`, undefined],
      ["PUT", `/me/resumes/${HANTU}`, { title: "CV Baru" }],
      ["DELETE", `/me/resumes/${HANTU}`, undefined],
      ["GET", `/me/resumes/${HANTU}/pdf`, undefined],
      ["POST", `/me/resumes/${HANTU}/pdf`, undefined],
    ] as const) {
      const res = await panggil(base, method, path, undefined, body);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(await badan(res)).toMatchObject({ code: "TIDAK_TERAUTENTIKASI" });
    }
  });
});

describe("CRUD lengkap (AC-1)", () => {
  it("buat, baca satu, baca daftar, ubah, hapus", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    expect(await badan(await panggil(base, "GET", "/me/resumes", token))).toEqual({ data: [] });

    const dibuat = await panggil(base, "POST", "/me/resumes", token, { title: "CV Utama" });
    expect(dibuat.status).toBe(201);
    const item = (await badan(dibuat)).data as Record<string, unknown>;
    // Lolos kontrak zod yang SAMA dengan yang dipakai klien (PR-061).
    expect(() => resumeSchema.parse(item)).not.toThrow();
    // `userId` ikut terbawa dari tabel palsu; pemetaan eksplisit di service yang
    // menahannya. Kalau ia muncul di sini, kolom baru berikutnya akan ikut bocor
    // tanpa satu pun sinyal.
    expect(item).not.toHaveProperty("userId");

    const id = item.id as string;
    const satu = await panggil(base, "GET", `/me/resumes/${id}`, token);
    expect(satu.status).toBe(200);
    expect((await badan(satu)).data).toMatchObject({ id, title: "CV Utama" });

    const daftar = (await badan(await panggil(base, "GET", "/me/resumes", token)))
      .data as Record<string, unknown>[];
    expect(daftar).toHaveLength(1);
    // Daftar TIDAK membawa isi CV — dipakai untuk memilih, bukan untuk membaca.
    expect(daftar[0]).not.toHaveProperty("content");
    expect(() => resumeSummarySchema.parse(daftar[0])).not.toThrow();

    const diubah = await panggil(base, "PUT", `/me/resumes/${id}`, token, { title: "CV Desain" });
    expect(diubah.status).toBe(200);
    expect((await badan(diubah)).data).toMatchObject({ id, title: "CV Desain" });

    const dihapus = await panggil(base, "DELETE", `/me/resumes/${id}`, token);
    expect(dihapus.status).toBe(204);
    expect(await dihapus.text()).toBe("");
    expect(await badan(await panggil(base, "GET", "/me/resumes", token))).toEqual({ data: [] });
  });

  it("CV lahir dengan isi kosong yang lengkap bentuknya", async () => {
    // `content` tidak dikirim sama sekali. Yang tersimpan tetap dokumen utuh —
    // bawaannya diisi gerbang zod, bukan dibiarkan `undefined` untuk dijaga
    // setiap pembacanya nanti (editor, template PDF, ekstraksi AI).
    const { base, rows } = await boot();
    const token = await tokenUntuk(A);

    const dibuat = await panggil(base, "POST", "/me/resumes", token, { title: "CV Kosong" });
    const isi = ((await badan(dibuat)).data as { content: Record<string, unknown> }).content;

    expect(isi).toEqual({
      schemaVersion: 1,
      headline: null,
      summary: null,
      contact: { email: null, phone: null, city: null, province: null, links: [] },
      experiences: [],
      educations: [],
      skills: [],
      certifications: [],
      organizations: [],
    });
    expect(rows.at(0)?.content).toEqual(isi);
  });

  it("PUT mengganti isi CV secara UTUH, bukan menggabung per bagian", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const dibuat = await panggil(base, "POST", "/me/resumes", token, {
      title: "CV Utama",
      content: { headline: "Desainer grafis", skills: [{ name: "Photoshop" }] },
    });
    const id = ((await badan(dibuat)).data as { id: string }).id;

    const diubah = await panggil(base, "PUT", `/me/resumes/${id}`, token, {
      content: { headline: "Desainer grafis senior" },
    });
    const isi = ((await badan(diubah)).data as { content: Record<string, unknown> }).content;

    expect(isi.headline).toBe("Desainer grafis senior");
    // Penggabungan di server menuntut aturan untuk setiap larik ("kirim
    // `skills` kosong" = hapus semuanya, atau jangan ubah apa pun?), dan aturan
    // yang tidak bisa dijawab tanpa menebak akan ditebak berbeda oleh setiap
    // klien. Editor PR-061 mengirim dokumen utuh dengan satu bagian berubah.
    expect(isi.skills).toEqual([]);
  });

  it("PUT tanpa `content` tidak menyentuh isi CV", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);

    const dibuat = await panggil(base, "POST", "/me/resumes", token, {
      title: "CV Utama",
      content: { headline: "Desainer grafis" },
    });
    const id = ((await badan(dibuat)).data as { id: string }).id;

    const diubah = await panggil(base, "PUT", `/me/resumes/${id}`, token, { title: "CV Lamaran" });
    const data = (await badan(diubah)).data as { title: string; content: { headline: string } };

    expect(data.title).toBe("CV Lamaran");
    expect(data.content.headline).toBe("Desainer grafis");
  });
});

describe("kepemilikan (AC-1) — CV orang lain berperilaku seperti CV yang tidak ada", () => {
  it("daftar, baca, ubah, dan hapus tidak pernah menjangkau CV milik B", async () => {
    const { base, rows } = await boot({ baris: [barisCv()] });
    const token = await tokenUntuk(A);

    expect(await badan(await panggil(base, "GET", "/me/resumes", token))).toEqual({ data: [] });

    // 404, BUKAN 403: jawaban yang membedakan keduanya memberi tahu penebak UUID
    // bahwa id yang ia coba benar-benar ada dan dimiliki seseorang.
    for (const [method, body] of [
      ["GET", undefined],
      ["PUT", { title: "Dibajak" }],
      ["DELETE", undefined],
    ] as const) {
      const res = await panggil(base, method, `/me/resumes/${HANTU}`, token, body);
      expect(res.status, method).toBe(404);
      expect(await badan(res)).toMatchObject({ code: "CV_TIDAK_DITEMUKAN" });
    }

    // Dan barisnya benar-benar tidak tersentuh.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: B, title: "CV Milik Orang Lain" });
  });

  it("CV milik B tidak ikut terhitung pada batas milik A", async () => {
    // Hitungan yang lupa menyebut `userId` akan membuat batas seorang pengguna
    // habis oleh CV orang lain — kegagalan yang tidak akan pernah dilaporkan
    // sebagai kebocoran, hanya sebagai "kenapa saya tidak bisa membuat CV".
    const { base } = await boot({
      baris: [barisCv(), barisCv({ id: "018f4c1e-0000-7000-8000-00000000cccd" })],
      maksPerPengguna: 2,
    });
    const res = await panggil(base, "POST", "/me/resumes", await tokenUntuk(A), { title: "CV A" });
    expect(res.status).toBe(201);
  });

  it("id yang bukan UUID ditolak 400 di gerbang, bukan diteruskan ke Prisma", async () => {
    const { base } = await boot();
    const res = await panggil(base, "GET", "/me/resumes/bukan-uuid", await tokenUntuk(A));

    expect(res.status).toBe(400);
    expect(await badan(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("batas CV per pengguna (AC-3)", () => {
  it("permintaan melewati batas dijawab 409 dengan jalan keluar yang nyata", async () => {
    const { base } = await boot({ maksPerPengguna: 2 });
    const token = await tokenUntuk(A);

    expect((await panggil(base, "POST", "/me/resumes", token, { title: "CV 1" })).status).toBe(201);
    expect((await panggil(base, "POST", "/me/resumes", token, { title: "CV 2" })).status).toBe(201);

    const ketiga = await panggil(base, "POST", "/me/resumes", token, { title: "CV 3" });
    expect(ketiga.status).toBe(409);
    const body = await badan(ketiga);
    expect(body).toMatchObject({ code: "BATAS_CV_TERCAPAI" });
    expect(body.message).toContain("2");
    // Pengguna yang hanya diberi tahu "batas tercapai" tidak punya langkah
    // berikutnya; hint menyebutkan apa yang harus ia lakukan.
    expect(body.hint).toContain("Hapus");
  });

  it("menghapus satu CV mengembalikan jatahnya", async () => {
    const { base } = await boot({ maksPerPengguna: 1 });
    const token = await tokenUntuk(A);

    const dibuat = await panggil(base, "POST", "/me/resumes", token, { title: "CV 1" });
    const id = ((await badan(dibuat)).data as { id: string }).id;
    expect((await panggil(base, "POST", "/me/resumes", token, { title: "CV 2" })).status).toBe(409);

    await panggil(base, "DELETE", `/me/resumes/${id}`, token);
    expect((await panggil(base, "POST", "/me/resumes", token, { title: "CV 2" })).status).toBe(201);
  });
});

describe("validasi struktur (AC-2) — pesan per field, Bahasa Indonesia sederhana", () => {
  it("judul kosong ditolak 400", async () => {
    const { base } = await boot();
    const res = await panggil(base, "POST", "/me/resumes", await tokenUntuk(A), { title: "  " });

    expect(res.status).toBe(400);
    expect(await badan(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("isi CV yang strukturnya salah ditolak sebelum menyentuh database", async () => {
    const { base, rows } = await boot();
    const res = await panggil(base, "POST", "/me/resumes", await tokenUntuk(A), {
      title: "CV Utama",
      content: { experiences: [{ title: "Analis", startDate: "2022-05-01", endDate: "2021-01-01" }] },
    });

    expect(res.status).toBe(400);
    expect(rows).toHaveLength(0);
  });

  it("field disabilitas di isi CV ditolak (AC-4)", async () => {
    // Pengungkapan ragam disabilitas tetap keputusan terpisah per lamaran
    // (PR-075). `.strict()` di seluruh objek isi CV-lah yang menegakkannya —
    // bukan kehati-hatian siapa pun yang menulis klien.
    const { base, rows } = await boot();
    const res = await panggil(base, "POST", "/me/resumes", await tokenUntuk(A), {
      title: "CV Utama",
      content: { disabilityTypes: ["tuli"] },
    });

    expect(res.status).toBe(400);
    expect(rows).toHaveLength(0);
  });

  it("klien tidak bisa mengakui createdVia (AC-5)", async () => {
    const { base } = await boot();
    const res = await panggil(base, "POST", "/me/resumes", await tokenUntuk(A), {
      title: "CV Utama",
      createdVia: "ai_chat",
    });

    // Ditolak `.strict()`, bukan diabaikan diam-diam: klien yang mengira
    // nilainya diterima akan menampilkan lencana "dibuat AI" pada CV manual.
    expect(res.status).toBe(400);
  });

  it("CV yang lahir dari endpoint ini selalu manual", async () => {
    const { base, rows } = await boot();
    const dibuat = await panggil(base, "POST", "/me/resumes", await tokenUntuk(A), {
      title: "CV Utama",
    });

    expect(((await badan(dibuat)).data as { createdVia: string }).createdVia).toBe("manual");
    expect(rows.at(0)?.createdVia).toBe("manual");
  });
});

describe("PDF API (PR-064)", () => {
  it("POST 202 mengantre dan GET memetakan status job", async () => {
    let state: "missing" | "queued" = "missing";
    const pdf: NonNullable<ResumesModuleDeps["pdf"]> = {
      jobs: {
        state: () => Promise.resolve(state),
        ensure: () => {
          state = "queued";
          return Promise.resolve("queued");
        },
      },
      storage: { presignDownload: () => Promise.reject(new Error("belum siap")) },
    };
    const { base } = await boot({ pdf });
    const token = await tokenUntuk(A);
    const dibuat = await panggil(base, "POST", "/me/resumes", token, { title: "CV PDF" });
    const id = ((await badan(dibuat)).data as { id: string }).id;

    const minta = await panggil(base, "POST", `/me/resumes/${id}/pdf`, token);
    expect(minta.status).toBe(202);
    expect(minta.headers.get("cache-control")).toBe("private, no-store");
    expect(await badan(minta)).toEqual({ data: { status: "queued" } });

    const status = await panggil(base, "GET", `/me/resumes/${id}/pdf`, token);
    expect(status.status).toBe(200);
    expect(status.headers.get("cache-control")).toBe("private, no-store");
    expect(await badan(status)).toEqual({ data: { status: "queued" } });
  });

  it("tanpa konfigurasi storage menjawab 503; CV milik orang lain tetap 404", async () => {
    const tanpa = await boot();
    const token = await tokenUntuk(A);
    expect((await panggil(tanpa.base, "GET", `/me/resumes/${HANTU}/pdf`, token)).status).toBe(503);
    await active?.stop();
    active = null;

    const pdf: NonNullable<ResumesModuleDeps["pdf"]> = {
      jobs: { state: () => Promise.resolve("missing"), ensure: () => Promise.resolve("queued") },
      storage: {
        presignDownload: () =>
          Promise.resolve({ url: "https://storage.test/file", expiresAt: new Date() }),
      },
    };
    const dengan = await boot({ baris: [barisCv()], pdf });
    expect((await panggil(dengan.base, "GET", `/me/resumes/${HANTU}/pdf`, token)).status).toBe(404);
  });
});

describe("deklarasi akses route (PR-019)", () => {
  it("tujuh route CV, seluruhnya menuntut sesi", async () => {
    const { registry } = await boot();
    const daftar = registry.list();

    expect(daftar.map((e) => `${e.method} ${e.path}`).sort()).toEqual([
      "DELETE /api/v1/me/resumes/:id",
      "GET /api/v1/me/resumes",
      "GET /api/v1/me/resumes/:id",
      "GET /api/v1/me/resumes/:id/pdf",
      "POST /api/v1/me/resumes",
      "POST /api/v1/me/resumes/:id/pdf",
      "PUT /api/v1/me/resumes/:id",
    ]);

    // `authenticated`, BUKAN `self` — `:id` di sini adalah id CV, bukan id
    // pengguna, dan `requireSelf` akan membandingkannya dengan userId pemilik
    // sesi lalu menolak SETIAP permintaan yang sah. Kepemilikannya dijaga di
    // repository, tempat yang tidak bisa dilewati.
    for (const entri of daftar) {
      expect(entri.access.kind, entri.path).toBe("authenticated");
    }
  });
});
