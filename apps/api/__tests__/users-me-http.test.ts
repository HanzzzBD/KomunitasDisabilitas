// Integration HTTP profil akun (PR-020) — server Express nyata, token RS256
// nyata, guard sesi dari registrar PR-019.
//
// AC yang dijaga file ini: "User A tidak bisa baca/ubah user B", "Validasi
// email/nama dengan pesan sederhana", dan "Response tanpa field internal".
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { UserRole } from "@nawasena/schemas";
import { meSchema } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createUsersModule } from "../src/modules/users/index.js";
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

interface BarisUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  tokenVersion: number;
  googleId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

function userAwal(): BarisUser[] {
  return [
    {
      id: A,
      fullName: "Rina Pratiwi",
      email: "rina@contoh.id",
      phone: "+6281234567890",
      role: "seeker",
      tokenVersion: 0,
      googleId: "google-rina",
      createdAt: new Date("2026-08-01T03:00:00.000Z"),
      deletedAt: null,
    },
    {
      id: B,
      fullName: "Bayu Santoso",
      email: "bayu@contoh.id",
      phone: "+6281200000002",
      role: "admin",
      tokenVersion: 0,
      googleId: null,
      createdAt: new Date("2026-08-02T03:00:00.000Z"),
      deletedAt: null,
    },
  ];
}

/**
 * Prisma palsu: tabel users in-memory yang MENGHORMATI unique parsial email
 * (migrasi 06) — di situlah letak penolakan 409, jadi fake yang mengabaikannya
 * akan membuat test lulus atas perilaku yang tidak ada.
 */
function fakePrisma(rows: BarisUser[]) {
  // Kelas error Prisma yang SUNGGUHAN: repository membedakan P2002 dari P2025
  // lewat `instanceof`, jadi error tiruan berbentuk `Error & {code}` akan lolos
  // ke 500 dan membuat test lulus atas jalur yang tidak pernah dijalankan.
  const prismaError = (code: string, message: string) =>
    new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: "5.22.0" });

  const client = {
    user: {
      findFirst: ({ where }: { where: { id?: string; deletedAt?: null } }) => {
        const found = rows.find((u) => u.deletedAt === null && u.id === where.id);
        // SALINAN, bukan referensi — Prisma sungguhan tidak pernah mengembalikan
        // objek yang sama dengan baris yang kemudian diperbarui.
        return Promise.resolve(found === undefined ? null : { ...found });
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { fullName: string; email?: string | null };
      }) => {
        const baris = rows.find((u) => u.deletedAt === null && u.id === where.id);
        if (baris === undefined) {
          return Promise.reject(prismaError("P2025", "Record to update not found"));
        }
        // Wasit unique parsial `users_email_aktif_key` (migrasi 06) ditiru di
        // sini; kebenarannya terhadap PostgreSQL nyata diuji di users-me-db.
        if (
          data.email !== undefined &&
          data.email !== null &&
          rows.some((u) => u.deletedAt === null && u.id !== where.id && u.email === data.email)
        ) {
          return Promise.reject(prismaError("P2002", "Unique constraint failed"));
        }
        baris.fullName = data.fullName;
        if (data.email !== undefined) baris.email = data.email;
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

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot(options: { sessionKeys?: typeof SESSION_KEYS } = {}) {
  const env = testEnv();
  const baris = userAwal();
  const logSink: string[] = [];
  const logger = createLogger(env, {
    destination: new Writable({
      write(chunk, _e, cb) {
        logSink.push(String(chunk));
        cb();
      },
    }),
  });
  const audit: Array<{ action: string; meta: unknown }> = [];
  const prisma = fakePrisma(baris);

  const kunci = "sessionKeys" in options ? options.sessionKeys : SESSION_KEYS;
  const guards = createAccessGuards({
    tokenService: kunci === undefined ? undefined : createTokenService(kunci),
    findSessionUser: (id) => {
      const u = baris.find((r) => r.deletedAt === null && r.id === id);
      return Promise.resolve(u === undefined ? null : { id: u.id, role: u.role, tokenVersion: u.tokenVersion });
    },
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createUsersModule({
          prisma,
          routes: registry.forModule("/api/v1"),
          auditLog: (_actor, action, _entity, _entityId, meta) => {
            audit.push({ action, meta });
          },
        }),
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, baris, audit, logSink };
}

async function tokenUntuk(userId: string, role: UserRole = "seeker"): Promise<string> {
  return tokens.signAccessToken({ sub: userId, role, ver: 0 });
}

function ambil(base: string, path: string, token?: string) {
  return fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function simpan(base: string, token: string, body: unknown) {
  return fetch(`${base}/me`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/me", () => {
  it("mengembalikan profil PEMILIK TOKEN, sesuai kontrak zod", async () => {
    const { base } = await boot();
    const res = await ambil(base, "/me", await tokenUntuk(A));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(meSchema.safeParse(body.data).success).toBe(true);
    expect(body.data).toMatchObject({ id: A, fullName: "Rina Pratiwi", role: "seeker" });
  });

  it("dua token berbeda → dua profil berbeda (AC: A tidak melihat B)", async () => {
    const { base } = await boot();

    const dariA = (await (await ambil(base, "/me", await tokenUntuk(A))).json()) as {
      data: { id: string };
    };
    const dariB = (await (await ambil(base, "/me", await tokenUntuk(B, "admin"))).json()) as {
      data: { id: string };
    };

    expect(dariA.data.id).toBe(A);
    expect(dariB.data.id).toBe(B);
  });

  it("response TIDAK memuat field internal (AC)", async () => {
    const { base } = await boot();
    const body = (await (await ambil(base, "/me", await tokenUntuk(A))).json()) as {
      data: Record<string, unknown>;
    };

    for (const terlarang of ["tokenVersion", "googleId", "deletedAt", "lastActiveAt"]) {
      expect(body.data).not.toHaveProperty(terlarang);
    }
    expect(Object.keys(body.data).sort()).toEqual([
      "createdAt",
      "email",
      "fullName",
      "id",
      "phone",
      "role",
    ]);
  });

  it("tanpa token → 401; token akun tak dikenal → 401", async () => {
    const { base } = await boot();

    expect((await ambil(base, "/me")).status).toBe(401);
    const asing = await tokens.signAccessToken({
      sub: "018f4c1e-0000-7000-8000-00000000dead",
      role: "seeker",
      ver: 0,
    });
    expect((await ambil(base, "/me", asing)).status).toBe(401);
  });

  it("tanpa kunci sesi di server → 503, bukan 401", async () => {
    const { base } = await boot({ sessionKeys: undefined });
    const res = await ambil(base, "/me", "apa-pun");
    expect(res.status).toBe(503);
  });
});

describe("PUT /api/v1/me — isolasi antar pengguna (AC)", () => {
  it("A menyelundupkan id/userId B di body → yang berubah tetap milik A", async () => {
    const { base, baris } = await boot();

    const res = await simpan(base, await tokenUntuk(A), {
      fullName: "Nama Baru A",
      id: B,
      userId: B,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; fullName: string } };
    expect(body.data.id).toBe(A);
    // Baris B tidak tersentuh sama sekali.
    expect(baris.find((u) => u.id === B)?.fullName).toBe("Bayu Santoso");
  });

  it("field asing di body dibuang zod, tidak tersimpan", async () => {
    const { base, baris } = await boot();
    await simpan(base, await tokenUntuk(A), { fullName: "Rina Baru", role: "admin" });

    // Peran tidak boleh bisa dinaikkan lewat endpoint profil.
    expect(baris.find((u) => u.id === A)?.role).toBe("seeker");
  });
});

describe("PUT /api/v1/me — validasi (AC: pesan sederhana)", () => {
  it("nama terlalu pendek → 400 dengan hint yang menyebut perbaikannya", async () => {
    const { base } = await boot();
    const res = await simpan(base, await tokenUntuk(A), { fullName: "R" });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; message: string; hint?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.hint).toContain("minimal 2 huruf");
  });

  it("email tanpa format email → 400 dengan contoh di hint", async () => {
    const { base } = await boot();
    const res = await simpan(base, await tokenUntuk(A), { fullName: "Rina", email: "bukan-email" });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { hint?: string };
    expect(body.hint).toContain("nama@contoh.com");
  });

  it("nama wajib ada", async () => {
    const { base } = await boot();
    expect((await simpan(base, await tokenUntuk(A), { email: "x@contoh.id" })).status).toBe(400);
  });

  it("email dinormalkan ke huruf kecil sebelum disimpan", async () => {
    const { base, baris } = await boot();
    await simpan(base, await tokenUntuk(A), { fullName: "Rina", email: "  Rina@Contoh.ID  " });
    expect(baris.find((u) => u.id === A)?.email).toBe("rina@contoh.id");
  });
});

describe("PUT /api/v1/me — email unik antar akun aktif", () => {
  it("memakai email milik akun lain → 409, dan baris tidak berubah", async () => {
    const { base, baris } = await boot();

    const res = await simpan(base, await tokenUntuk(A), {
      fullName: "Rina",
      email: "bayu@contoh.id",
    });

    expect(res.status).toBe(409);
    expect((await res.json()) as { code: string }).toMatchObject({
      code: "EMAIL_TIDAK_BISA_DIPAKAI",
    });
    expect(baris.find((u) => u.id === A)?.email).toBe("rina@contoh.id");
  });

  it("email sendiri boleh dikirim ulang (idempoten)", async () => {
    const { base } = await boot();
    const res = await simpan(base, await tokenUntuk(A), {
      fullName: "Rina",
      email: "rina@contoh.id",
    });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/me — audit & log", () => {
  it("perubahan email teraudit; menyimpan nama saja tidak", async () => {
    const { base, audit } = await boot();
    const token = await tokenUntuk(A);

    await simpan(base, token, { fullName: "Rina P." });
    expect(audit).toHaveLength(0);

    await simpan(base, token, { fullName: "Rina P.", email: "baru@contoh.id" });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("ACCOUNT_EMAIL_CHANGED");
  });

  it("email & nomor HP tidak pernah muncul di log request", async () => {
    const { base, logSink } = await boot();
    await simpan(base, await tokenUntuk(A), { fullName: "Rina", email: "rahasia@contoh.id" });

    const semua = logSink.join("\n");
    expect(semua).not.toContain("rahasia@contoh.id");
    expect(semua).not.toContain("+6281234567890");
  });
});
