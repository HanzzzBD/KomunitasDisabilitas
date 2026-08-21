// Integration DB akses data sensitif (PR-039) — PostgreSQL sungguhan.
//
// DUA HAL YANG HANYA BISA DIBUKTIKAN DI SINI, dan keduanya adalah inti PR:
//
//   1. `select` jalur aman benar-benar tidak MENGAMBIL kolom sensitif. Fake
//      apa pun akan lulus dengan mengembalikan bentuk yang benar; yang ingin
//      dibuktikan adalah bahwa kolomnya tidak pernah meninggalkan PostgreSQL.
//   2. `SELECT … FOR UPDATE` benar-benar menutup jendela yang ditinggalkan
//      PR-037. Itu perilaku PENGUNCIAN, dan tidak ada tiruan yang memilikinya.
//
// Pola skip anggun sama dengan profiles-db.test.ts: tanpa DB, file ini dilewati;
// CI selalu punya service Postgres.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createFieldCrypto, parseFieldKeys } from "../src/core/crypto/index.js";
import { createProfileRepository } from "../src/modules/profiles/repositories/profile.repository.js";
import { createSensitiveAccess } from "../src/modules/profiles/services/sensitive-access.service.js";
import { AppError } from "../src/core/http/index.js";

const prisma = new PrismaClient();
/** Klien KEDUA — dipakai memegang transaksi penahan pada uji penguncian. */
const prismaLain = new PrismaClient();
let dbTersedia = false;

const crypto = createFieldCrypto(
  parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 11).toString("base64") }),
);

const repo = createProfileRepository(prisma as unknown as AppPrisma);

interface Jejak {
  action: string;
  entityId: string | null;
  meta: unknown;
}
const jejak: Jejak[] = [];

const akses = createSensitiveAccess({
  profileRepository: repo,
  crypto,
  auditLog: (_actor, action, _entity, entityId, meta) => jejak.push({ action, entityId, meta }),
});

/** Nomor uji berprefiks khusus supaya pembersihan tidak menyentuh data lain. */
const PREFIX_UJI = "+62885";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test akses sensitif dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    const usersUji = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX_UJI } } });
    for (const u of usersUji) await prisma.user.delete({ where: { id: u.id } });
  }
  await Promise.allSettled([prisma.$disconnect(), prismaLain.$disconnect()]);
});

let urutan = 0;

/** Akun + profil berisi data sensitif ber-consent. */
async function buatProfil(): Promise<string> {
  urutan += 1;
  const user = await prisma.user.create({
    data: {
      id: uuidV7(),
      phone: `${PREFIX_UJI}${String(urutan).padStart(6, "0")}`,
      fullName: "Uji Akses",
    },
  });
  await prisma.seekerProfile.create({
    data: {
      userId: user.id,
      headline: "Analis data",
      city: "Yogyakarta",
      consentSensitiveAt: new Date("2026-08-01T03:00:00.000Z"),
      disabilityTypes: crypto.encryptJson(["tuli"]),
      accommodationNeeds: crypto.encryptJson({ tags: ["juru_bahasa_isyarat"], notes: null }),
    },
  });
  jejak.length = 0;
  return user.id;
}

describe("jalur aman tidak mengambil kolom sensitif", () => {
  it("hasilnya tidak punya kunci sensitif sama sekali", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const userId = await buatProfil();

    const aman = await akses.bacaAman(userId);

    expect(aman).toEqual({
      headline: "Analis data",
      summary: null,
      city: "Yogyakarta",
      province: null,
      openToRemote: false,
      disclosureDefault: "ask_each_time",
    });
    // `toEqual` di atas sudah menuntut kesamaan penuh, tetapi kegagalannya akan
    // terbaca sebagai "objek berbeda". Ketiga baris ini menamai apa yang salah.
    expect(aman).not.toHaveProperty("disabilityTypes");
    expect(aman).not.toHaveProperty("accommodationNeeds");
    expect(aman).not.toHaveProperty("consentSensitiveAt");
  });

  it("barisnya memang berisi — penjaga di atas tidak lulus karena datanya kosong", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const userId = await buatProfil();

    const mentah = await prisma.$queryRaw<Array<{ disability_types: Buffer | null }>>(
      Prisma.sql`SELECT disability_types FROM seeker_profiles WHERE user_id = ${userId}::uuid`,
    );

    expect(mentah[0]?.disability_types).toBeInstanceOf(Buffer);
  });
});

describe("jalur sensitif terhadap DB sungguhan", () => {
  it("mengembalikan data terdekripsi DAN menulis satu baris audit", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const userId = await buatProfil();

    const profil = await akses.bacaSensitif(
      { userId: uuidV7(), requestId: uuidV7() },
      userId,
      { purpose: "support", reason: "tiket #4821" },
    );

    expect(profil?.sensitive?.disabilityTypes).toEqual(["tuli"]);
    expect(jejak).toHaveLength(1);
    expect(jejak[0]).toMatchObject({
      action: "PROFILE_SENSITIVE_READ",
      entityId: userId,
      meta: { purpose: "support", reason: "tiket #4821" },
    });
  });

  it("tanpa alasan → error sebelum query dijalankan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const userId = await buatProfil();

    await expect(
      akses.bacaSensitif({ userId: uuidV7(), requestId: uuidV7() }, userId, {
        purpose: "support",
        reason: "",
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(jejak).toEqual([]);
  });
});

describe("penjaga consent di bawah penguncian baris (utang PR-037)", () => {
  it("pencabutan yang commit di tengah jendela MENANG — tulisan sensitif ditolak", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const userId = await buatProfil();

    // Transaksi A mencabut consent lalu MENAHAN diri — barisnya terkunci, tetapi
    // pencabutannya belum terlihat oleh transaksi mana pun.
    let lepas!: () => void;
    const tahan = new Promise<void>((r) => (lepas = r));
    // A memberi ABA-ABA setelah barisnya benar-benar terkunci. Tanpa ini, B bisa
    // mendahului A merebut kunci — dan test-nya berubah menjadi lomba yang
    // kadang menguji hal yang benar dan kadang tidak.
    let sudahMengunci!: () => void;
    const terkunci = new Promise<void>((r) => (sudahMengunci = r));
    const a = prismaLain.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`UPDATE seeker_profiles SET consent_sensitive_at = NULL
            WHERE user_id = ${userId}::uuid`,
        );
        sudahMengunci();
        await tahan;
      },
      { timeout: 20_000 },
    );
    await terkunci;

    // Transaksi B mencoba menyimpan data sensitif. `SELECT … FOR UPDATE`
    // miliknya harus MENUNGGU A, lalu membaca keadaan TERBARU.
    //
    // Tanpa FOR UPDATE (keadaan PR-037), SELECT biasa milik B membaca snapshot
    // sebelum A commit — yaitu consent yang masih berlaku — lalu UPDATE-nya
    // menunggu, dan setelah A lepas ia menulis ciphertext ke baris yang consent-
    // nya sudah dicabut. Persis keadaan yang tidak boleh ada.
    const b = repo.upsertByUserId(
      userId,
      { disabilityTypes: crypto.encryptJson(["netra"]) },
      { butuhConsent: true },
    );

    // Beri B kesempatan mencapai SELECT-nya sebelum A dilepas. Kalau jeda ini
    // meleset, B berjalan SETELAH A commit dan tetap menjawab ok:false — jadi
    // ketidakpastiannya menumpulkan daya uji, bukan membuatnya salah lulus.
    await new Promise((r) => setTimeout(r, 400));
    lepas();
    await a;

    const hasil = await b;

    expect(hasil.ok).toBe(false);

    // Dan tulisannya benar-benar TIDAK terjadi. Ciphertext yang tersimpan masih
    // isi lama (`tuli`, dari fixture), bukan yang hendak ditulis B (`netra`) —
    // itulah bukti bahwa penolakan di atas bukan sekadar nilai balik yang benar
    // di atas tulisan yang terlanjur mendarat.
    //
    // Kolomnya memang masih terisi: A mencabut consent lewat UPDATE mentah, yang
    // hanya menyentuh `consent_sensitive_at`. Pencabutan lewat jalur sungguhnya
    // (`updateMe`) ikut mengosongkan kedua kolom — dan justru keadaan yang
    // ditiru di sini, ciphertext tanpa consent, yang membuat jalur baca modul
    // ini dibuat buntu oleh consent (PR-037, `keProfil`).
    const sesudah = await prisma.$queryRaw<
      Array<{ consent_sensitive_at: Date | null; disability_types: Buffer | null }>
    >(
      Prisma.sql`SELECT consent_sensitive_at, disability_types FROM seeker_profiles
        WHERE user_id = ${userId}::uuid`,
    );
    expect(sesudah[0]?.consent_sensitive_at).toBeNull();
    const tersimpan = sesudah[0]?.disability_types;
    expect(tersimpan).toBeInstanceOf(Buffer);
    expect(crypto.decryptJson<string[]>(tersimpan as Buffer)).toEqual(["tuli"]);
  });

  it("baris yang belum pernah ada tetap bisa lahir bersama consent-nya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // `FOR UPDATE` tidak mengunci apa pun pada baris yang belum ada. Itu bukan
    // celah: tidak ada consent untuk dicabut pada baris yang belum lahir, dan
    // jalur INSERT dijaga primary key.
    urutan += 1;
    const user = await prisma.user.create({
      data: {
        id: uuidV7(),
        phone: `${PREFIX_UJI}${String(urutan).padStart(6, "0")}`,
        fullName: "Uji Akses Baru",
      },
    });

    const hasil = await repo.upsertByUserId(
      user.id,
      {
        consentSensitiveAt: new Date("2026-08-21T00:00:00.000Z"),
        disabilityTypes: crypto.encryptJson(["daksa"]),
      },
      { butuhConsent: true },
    );

    expect(hasil.ok).toBe(true);
    expect(hasil.ok && hasil.row.disabilityTypes).toBeInstanceOf(Buffer);
  });

  it("tanpa consent sama sekali, tulisan sensitif tetap ditolak", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    urutan += 1;
    const user = await prisma.user.create({
      data: {
        id: uuidV7(),
        phone: `${PREFIX_UJI}${String(urutan).padStart(6, "0")}`,
        fullName: "Uji Tanpa Consent",
      },
    });

    const hasil = await repo.upsertByUserId(
      user.id,
      { disabilityTypes: crypto.encryptJson(["autisme"]) },
      { butuhConsent: true },
    );

    expect(hasil.ok).toBe(false);
    expect(await prisma.seekerProfile.findUnique({ where: { userId: user.id } })).toBeNull();
  });
});
