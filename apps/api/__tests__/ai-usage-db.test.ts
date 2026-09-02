// Integration DB `ai_usage` (PR-043b, AC-1) — butuh PostgreSQL hidup + migrasi
// 10 ter-apply. Skip otomatis bila DB tidak terjangkau (pola db-migrasi.test.ts).
//
// Yang dibuktikan di sini hanya bisa dibuktikan oleh Postgres sungguhan:
//   1. kolom `prompt_version` benar-benar ADA dan benar-benar NULLABLE — sebab
//      migrasi yang lupa `NULL` akan menolak setiap baris yang ditulis hari ini
//      (registry prompt baru lahir di PR-044, jadi SEMUA baris masih NULL);
//   2. agregasi bulanan menghasilkan angka yang SAMA seperti sebelum kolom itu
//      ada. `finalkanBulanAiUsage` memfinalkan satu bulan SEKALI dan tidak
//      pernah menghitung ulang, jadi seandainya kolom baru diam-diam ikut
//      mengelompokkan, kesalahannya permanen dan senyap.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidV7 } from "../src/core/ids/index.js";
import { createRetentionService } from "../src/modules/users/index.js";
import { createPrismaClient } from "../src/core/db/index.js";

const prisma = createPrismaClient();
const mentah = new PrismaClient();

const TANDA = "ai-usage-pr043b";
const PROVIDER = "uji-043b";
/** Jam tetap; barisnya ditaruh di bulan yang SUDAH SELESAI agar layak difinalkan. */
const SEKARANG = new Date("2026-08-08T00:00:00.000Z");
const BULAN_LALU = new Date("2026-06-15T03:00:00.000Z");

let dbTersedia = false;
let userId = "";

/** Layanan retensi TANPA kebijakan hapus: yang diuji hanyalah agregasinya. */
function rakitAgregator() {
  return createRetentionService({
    prisma,
    policies: [],
    limits: { batchSize: 500, maxPerRun: 10_000 },
    auditLog: () => {
      /* audit tidak relevan bagi AC-1 */
    },
    clock: () => SEKARANG,
  });
}

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test ai_usage dilewati.");
    return;
  }

  userId = uuidV7();
  await mentah.user.create({ data: { id: userId, fullName: `Uji ${TANDA}` } });
});

async function bersihkan(): Promise<void> {
  if (!dbTersedia) return;
  await mentah.aiUsage.deleteMany({ where: { userId } });
  await mentah.aiUsageMonthly.deleteMany({});
}

beforeEach(bersihkan);

afterAll(async () => {
  if (dbTersedia) {
    await bersihkan();
    await mentah.user.deleteMany({ where: { fullName: `Uji ${TANDA}` } });
  }
  await mentah.$disconnect();
  await prisma.$disconnect();
});

async function tulisBaris(
  tokensIn: number,
  tokensOut: number,
  promptVersion: string | null,
): Promise<string> {
  const id = uuidV7();
  await mentah.aiUsage.create({
    data: {
      id,
      userId,
      feature: "cv_chat",
      provider: PROVIDER,
      tokensIn,
      tokensOut,
      promptVersion,
      createdAt: BULAN_LALU,
    },
  });
  return id;
}

describe("AC-1 — kolom ai_usage.prompt_version (migrasi 10)", () => {
  it("kolomnya ADA dan NULLABLE — bukan NOT NULL yang menolak setiap baris hari ini", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    const kolom = await mentah.$queryRaw<
      Array<{ column_name: string; is_nullable: string; data_type: string }>
    >`SELECT column_name, is_nullable, data_type
        FROM information_schema.columns
       WHERE table_name = 'ai_usage' AND column_name = 'prompt_version'`;

    expect(kolom).toHaveLength(1);
    expect(kolom[0]?.is_nullable).toBe("YES");
    expect(kolom[0]?.data_type).toBe("text");
  });

  it("baris tanpa versi tersimpan NULL; baris dengan versi menyimpannya apa adanya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // NULL BERARTI "belum ada registry prompt berversi", bukan "versi tak
    // diketahui" — sentinel string akan mengubur perbedaan itu selamanya.
    const kosong = await tulisBaris(10, 20, null);
    const berversi = await tulisBaris(1, 2, "cv-chat.v2");

    expect((await mentah.aiUsage.findUnique({ where: { id: kosong } }))?.promptVersion).toBeNull();
    expect((await mentah.aiUsage.findUnique({ where: { id: berversi } }))?.promptVersion).toBe(
      "cv-chat.v2",
    );
  });

  it("agregat bulanan TIDAK dipecah oleh prompt_version — angkanya identik seperti sebelum kolom ada", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Tiga baris satu bulan, satu fitur, satu provider, tiga nilai versi yang
    // berbeda. `GROUP BY month, feature, provider` harus tetap menghasilkan
    // SATU baris agregat — kalau tidak, `ai_usage_monthly` akan pecah menjadi
    // deret baris per versi dan primary key-nya bertabrakan.
    await tulisBaris(10, 20, null);
    await tulisBaris(25, 50, "cv-chat.v1");
    await tulisBaris(5, 10, "cv-chat.v2");

    const laporan = await rakitAgregator().run();

    expect(laporan.monthsAggregated).toBeGreaterThan(0);
    const agregat = await mentah.aiUsageMonthly.findMany({ where: { provider: PROVIDER } });
    expect(agregat).toHaveLength(1);
    expect(agregat[0]?.requests).toBe(3);
    expect(agregat[0]?.tokensIn).toBe(40n);
    expect(agregat[0]?.tokensOut).toBe(80n);
  });

  it("baris ai_usage ikut lenyap bersama pemiliknya (FK ON DELETE CASCADE) — dasar E3", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Inilah urutan yang membuat P2003 mungkin: purge PDP menghapus pemiliknya
    // di antara panggilan AI dan penulisan barisnya oleh worker.
    const lain = uuidV7();
    await mentah.user.create({ data: { id: lain, fullName: `Uji ${TANDA}` } });
    await mentah.aiUsage.create({
      data: {
        id: uuidV7(),
        userId: lain,
        feature: "embed",
        provider: PROVIDER,
        tokensIn: 0,
        tokensOut: 0,
        createdAt: BULAN_LALU,
      },
    });

    await mentah.user.delete({ where: { id: lain } });

    expect(await mentah.aiUsage.count({ where: { userId: lain } })).toBe(0);
  });
});
