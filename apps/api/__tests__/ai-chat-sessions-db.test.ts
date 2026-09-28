// Integration DB sesi AI CV Builder (PR-065) — PostgreSQL sungguhan.
//
// Yang dibuktikan di sini justru hal-hal yang TIDAK dijalankan satu baris pun
// kode repo ini, melainkan PostgreSQL:
//
//   1. APPEND AMAN KONKUREN — penomoran `seq` terjadi di dalam `UPDATE` pada
//      baris yang terkunci. Permintaan serentak menghasilkan 1..N tanpa ganda,
//      tanpa lubang, tanpa giliran yang tertimpa.
//   2. SATU SESI AKTIF — unique parsial `ai_chat_sessions_satu_aktif` + ON
//      CONFLICT. "Mulai" serentak berakhir di sesi yang SAMA.
//   3. BATAS UKURAN di `WHERE` yang sama dengan append.
//   4. SELEKTOR RETENSI (registry PR-024) — kedua kategori memilih baris yang
//      benar, dan predikatnya saling lepas.
//   5. MIGRASI DOWN benar-benar berjalan (di dalam transaksi yang di-rollback).
//
// Pola skip anggun sama dengan resumes-db.test.ts: tanpa DB, berkas ini
// dilewati; CI selalu punya service Postgres.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { AppError } from "../src/core/http/index.js";
import {
  createAiChatExportContributor,
  createAiChatSessionPolicies,
  createAiChatSessionsService,
  createChatSessionsRepository,
} from "../src/modules/ai/index.js";
import { createRetentionService } from "../src/modules/users/index.js";

const prisma = new PrismaClient();
let dbTersedia = false;

const repo = createChatSessionsRepository(prisma as unknown as AppPrisma);

/** Nomor uji berprefiks khusus supaya pembersihan tidak menyentuh data lain. */
const PREFIX_UJI = "+62886";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test sesi AI dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX_UJI } } });
  }
  await prisma.$disconnect();
});

let urutan = 0;

async function buatAktor(): Promise<{ userId: string }> {
  urutan += 1;
  const user = await prisma.user.create({
    data: {
      id: uuidV7(),
      phone: `${PREFIX_UJI}${String(urutan).padStart(6, "0")}`,
      fullName: "Uji Sesi AI",
    },
  });
  return { userId: user.id };
}

const service = (batas?: { maxTurns: number; maxTranscriptBytes: number }) =>
  createAiChatSessionsService({ repo, batas });

async function kodeGalat(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  throw new Error("seharusnya melempar");
}

describe("buat / baca / append (AC-1)", () => {
  it("sesi baru kosong, lalu giliran tersimpan berurutan dan terbaca utuh", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    const svc = service();

    const { session, baru } = await svc.mulaiAtauLanjutkan(aktor);
    expect(baru).toBe(true);
    expect(session).toMatchObject({ status: "active", turns: [], finalizedAt: null });

    await svc.tambahGiliran(aktor, session.id, {
      role: "assistant",
      content: "Halo! Apa pekerjaan terakhir Anda?",
    });
    // Non-latin + emoji: jsonb harus bolak-balik utuh.
    const kedua = await svc.tambahGiliran(aktor, session.id, {
      role: "user",
      content: "Kasir 🙂 di Bandung — «dua» tahun",
    });
    expect(kedua.seq).toBe(2);

    const dibaca = await svc.get(aktor, session.id);
    expect(dibaca.turns.map((t) => [t.seq, t.role, t.content])).toEqual([
      [1, "assistant", "Halo! Apa pekerjaan terakhir Anda?"],
      [2, "user", "Kasir 🙂 di Bandung — «dua» tahun"],
    ]);
  });

  it("mulai lagi saat sesi aktif ada → sesi yang SAMA (resume, bukan sesi baru)", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    const svc = service();

    const pertama = await svc.mulaiAtauLanjutkan(aktor);
    await svc.tambahGiliran(aktor, pertama.session.id, { role: "user", content: "halo" });
    const kedua = await svc.mulaiAtauLanjutkan(aktor);

    expect(kedua.baru).toBe(false);
    expect(kedua.session.id).toBe(pertama.session.id);
    expect(kedua.session.turns).toHaveLength(1);
  });
});

describe("authz — sesi milik orang lain berperilaku seperti tidak ada (AC-1)", () => {
  it("get dan append oleh pengguna lain → 404, dan barisnya tidak tersentuh", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const pemilik = await buatAktor();
    const penyusup = await buatAktor();
    const svc = service();
    const { session } = await svc.mulaiAtauLanjutkan(pemilik);

    expect(await kodeGalat(svc.get(penyusup, session.id))).toBe("AI_SESI_TIDAK_DITEMUKAN");
    expect(
      await kodeGalat(svc.tambahGiliran(penyusup, session.id, { role: "user", content: "suntik" })),
    ).toBe("AI_SESI_TIDAK_DITEMUKAN");
    expect((await svc.get(pemilik, session.id)).turns).toEqual([]);
  });
});

describe("konkurensi (AC-3)", () => {
  it("20 append serentak → seq 1..20 tanpa ganda/lubang, tak satu pun tertimpa", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    const svc = service();
    const { session } = await svc.mulaiAtauLanjutkan(aktor);

    const isi = Array.from({ length: 20 }, (_, i) => `pesan-${String(i)}`);
    const hasil = await Promise.all(
      isi.map((content) => svc.tambahGiliran(aktor, session.id, { role: "user", content })),
    );

    // Setiap pemanggil menerima seq yang unik…
    expect(hasil.map((t) => t.seq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    // …dan transkrip yang tersimpan cocok dengan yang dilaporkan.
    const { turns } = await svc.get(aktor, session.id);
    expect(turns.map((t) => t.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(turns.map((t) => t.content))).toEqual(new Set(isi));
    for (const t of hasil) {
      expect(turns[t.seq - 1]?.content).toBe(t.content);
    }
  });

  it("8 'mulai' serentak → tepat satu sesi aktif, semua menerima id yang sama", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    const svc = service();

    const hasil = await Promise.all(Array.from({ length: 8 }, () => svc.mulaiAtauLanjutkan(aktor)));

    expect(new Set(hasil.map((h) => h.session.id)).size).toBe(1);
    expect(hasil.filter((h) => h.baru)).toHaveLength(1);
    expect(await prisma.aiChatSession.count({ where: { userId: aktor.userId } })).toBe(1);
  });

  it("unique parsial menolak sesi aktif kedua yang ditulis langsung", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    await prisma.aiChatSession.create({ data: { id: uuidV7(), userId: aktor.userId } });

    await expect(
      prisma.aiChatSession.create({ data: { id: uuidV7(), userId: aktor.userId } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("batas ukuran transkrip (AC-5)", () => {
  it("giliran melebihi maxTurns → AI_TRANSKRIP_PENUH, transkrip tidak bertambah", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    const svc = service({ maxTurns: 3, maxTranscriptBytes: 1_000_000 });
    const { session } = await svc.mulaiAtauLanjutkan(aktor);
    for (let i = 0; i < 3; i += 1) {
      await svc.tambahGiliran(aktor, session.id, { role: "user", content: `ke-${String(i)}` });
    }

    expect(
      await kodeGalat(svc.tambahGiliran(aktor, session.id, { role: "user", content: "lagi" })),
    ).toBe("AI_TRANSKRIP_PENUH");
    expect((await svc.get(aktor, session.id)).turns).toHaveLength(3);
  });

  it("batas byte ditegakkan, dan tidak bisa dilewati permintaan serentak", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    // ~1.100 byte per giliran; batas 4.000 byte muat tiga, bukan sepuluh.
    const svc = service({ maxTurns: 1000, maxTranscriptBytes: 4_000 });
    const { session } = await svc.mulaiAtauLanjutkan(aktor);
    const panjang = "x".repeat(1_000);

    const hasil = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        svc.tambahGiliran(aktor, session.id, { role: "user", content: panjang }),
      ),
    );

    const lolos = hasil.filter((h) => h.status === "fulfilled").length;
    expect(lolos).toBeGreaterThan(0);
    expect(lolos).toBeLessThan(4);
    const [baris] = await prisma.$queryRaw<Array<{ ukuran: number }>>`
      SELECT octet_length("transcript"::text)::int AS ukuran
      FROM "ai_chat_sessions" WHERE "id" = ${session.id}::uuid`;
    expect(baris?.ukuran).toBeLessThanOrEqual(4_000);
  });

  it("isi di atas maxContentChars → VALIDATION_ERROR sebelum menyentuh DB", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    const svc = service();
    const { session } = await svc.mulaiAtauLanjutkan(aktor);

    expect(
      await kodeGalat(
        svc.tambahGiliran(aktor, session.id, { role: "user", content: "a".repeat(2_001) }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("sesi selesai", () => {
  it("sesi finalized menolak giliran baru (409) dan 'mulai' melahirkan sesi baru", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    const svc = service();
    const { session } = await svc.mulaiAtauLanjutkan(aktor);
    await prisma.aiChatSession.update({
      where: { id: session.id },
      data: { status: "finalized", finalizedAt: new Date() },
    });

    expect(
      await kodeGalat(svc.tambahGiliran(aktor, session.id, { role: "user", content: "lagi" })),
    ).toBe("AI_SESI_SUDAH_SELESAI");
    const berikut = await svc.mulaiAtauLanjutkan(aktor);
    expect(berikut.baru).toBe(true);
    expect(berikut.session.id).not.toBe(session.id);
  });

  it("CHECK menolak status/finalized_at yang tidak konsisten", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();

    await expect(
      prisma.aiChatSession.create({
        data: { id: uuidV7(), userId: aktor.userId, status: "finalized" },
      }),
    ).rejects.toThrow(/ai_chat_sessions_finalized_konsisten/);
  });
});

describe("retensi terdaftar di registry PR-024 (AC-2, test selector)", () => {
  const HARI = 86_400_000;
  const SEKARANG = new Date("2027-03-01T02:47:00.000Z");
  const lalu = (hari: number) => new Date(SEKARANG.getTime() - hari * HARI);

  it("finalized >30h & aktif-diam >30h dihapus; yang lebih muda selamat", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const [a, b, c, d] = [
      await buatAktor(),
      await buatAktor(),
      await buatAktor(),
      await buatAktor(),
    ];
    const tulis = (userId: string, data: Record<string, unknown>) =>
      prisma.aiChatSession.create({ data: { id: uuidV7(), userId, ...data } });

    const finalTua = await tulis(a.userId, {
      status: "finalized",
      finalizedAt: lalu(31),
      updatedAt: lalu(31),
    });
    const finalMuda = await tulis(b.userId, {
      status: "finalized",
      finalizedAt: lalu(29),
      updatedAt: lalu(29),
    });
    const aktifDiam = await tulis(c.userId, { updatedAt: lalu(31) });
    // Dibuat 90 hari lalu tetapi masih dipakai kemarin: umur BUKAN ukurannya.
    const aktifHidup = await tulis(d.userId, { createdAt: lalu(90), updatedAt: lalu(1) });

    const retensi = createRetentionService({
      prisma: prisma as unknown as AppPrisma,
      policies: createAiChatSessionPolicies({ repository: repo, days: 30 }),
      limits: { batchSize: 1_000, maxPerRun: 50_000 },
      auditLog: (() => Promise.resolve()) as never,
      clock: () => SEKARANG,
    });

    const laporan = await retensi.run({ dryRun: false });
    expect(laporan.policies.map((p) => p.policy)).toEqual([
      "ai_chat_sessions.finalized",
      "ai_chat_sessions.abandoned",
    ]);

    const tersisa = new Set(
      (
        await prisma.aiChatSession.findMany({
          where: { id: { in: [finalTua.id, finalMuda.id, aktifDiam.id, aktifHidup.id] } },
          select: { id: true },
        })
      ).map((r) => r.id),
    );
    expect(tersisa).toEqual(new Set([finalMuda.id, aktifHidup.id]));
  });
});

describe("ekspor PDP & hapus akun", () => {
  it("kontributor ekspor memuat seluruh sesi pemiliknya — dan hanya miliknya", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const pemilik = await buatAktor();
    const lain = await buatAktor();
    const svc = service();
    const { session } = await svc.mulaiAtauLanjutkan(pemilik);
    await svc.tambahGiliran(pemilik, session.id, { role: "user", content: "rahasia saya" });
    await svc.mulaiAtauLanjutkan(lain);

    const bagian = await createAiChatExportContributor({ chatSessions: svc }).kumpulkan(
      pemilik.userId,
    );
    expect(bagian).toEqual([await svc.get(pemilik, session.id)]);
  });

  it("hapus akun membawa serta transkripnya (cascade)", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const aktor = await buatAktor();
    const { session } = await service().mulaiAtauLanjutkan(aktor);

    await prisma.user.delete({ where: { id: aktor.userId } });
    expect(await prisma.aiChatSession.findUnique({ where: { id: session.id } })).toBeNull();
  });
});

describe("migrasi 16 — down teruji (AC-4)", () => {
  it("down.sql menghapus tabel & tipe, dan up.sql memulihkannya (dalam transaksi yang di-rollback)", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const dir = new URL(
      "../prisma/migrations/20260928090000_16_ai_chat_sessions/",
      import.meta.url,
    );
    const pernyataan = (berkas: string): string[] =>
      readFileSync(fileURLToPath(new URL(berkas, dir)), "utf8")
        .split("\n")
        .map((b) => b.replace(/--.*$/, ""))
        .join("\n")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s !== "");

    const ada = async (
      tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
    ) => {
      const [baris] = await tx.$queryRaw<Array<{ tabel: string | null; tipe: string | null }>>`
        SELECT to_regclass('public.ai_chat_sessions')::text AS tabel,
               to_regtype('"AiChatSessionStatus"')::text AS tipe`;
      return baris;
    };

    // DDL PostgreSQL transaksional: turun, periksa, naik lagi, periksa — lalu
    // BATALKAN semuanya supaya DB test lain tidak tersentuh.
    const BATAL = new Error("rollback-disengaja");
    await expect(
      prisma.$transaction(async (tx) => {
        for (const s of pernyataan("down.sql")) await tx.$executeRawUnsafe(s);
        expect(await ada(tx)).toEqual({ tabel: null, tipe: null });

        for (const s of pernyataan("migration.sql")) await tx.$executeRawUnsafe(s);
        expect(await ada(tx)).toEqual({ tabel: "ai_chat_sessions", tipe: '"AiChatSessionStatus"' });
        throw BATAL;
      }),
    ).rejects.toBe(BATAL);

    expect((await ada(prisma))?.tabel).toBe("ai_chat_sessions");
  });
});
