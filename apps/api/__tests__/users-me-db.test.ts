// Integration DB profil akun (PR-020) — butuh PostgreSQL hidup + migrasi 06.
// Skip otomatis bila DB tidak terjangkau (pola sama dengan test DB lain).
//
// Yang HANYA bisa dibuktikan di sini: bahwa unique parsial `users_email_aktif_key`
// benar-benar ada dan berperilaku parsial. Fake di users-me-http meniru
// perilakunya — dan tiruan yang tidak pernah dibandingkan dengan aslinya adalah
// cara paling rapi untuk lulus atas jaminan yang tidak dimiliki produksi.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidV7 } from "../src/core/ids/index.js";
import { createUserProfileRepository } from "../src/modules/users/index.js";

const prisma = new PrismaClient();
const repository = createUserProfileRepository(prisma);
let dbTersedia = false;

/** Penanda khusus test supaya pembersihan tidak menyentuh data lain. */
const EMAIL_SUFFIX = "@uji-pr020.invalid";
const NAMA_UJI = "Uji PR-020";
const NAMA_BARU = "Uji PR-020 Baru";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test profil akun dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    // Dibersihkan lewat fullName, bukan email: sebagian baris uji sengaja
    // dibuat TANPA email dan tidak akan terjangkau penyaring alamat.
    await prisma.user.deleteMany({ where: { fullName: { startsWith: NAMA_UJI } } });
  }
  await prisma.$disconnect();
});

async function buatUser(email: string | null): Promise<string> {
  const id = uuidV7();
  await prisma.user.create({ data: { id, fullName: NAMA_UJI, email } });
  return id;
}

describe("repository profil (integration)", () => {
  it("findActiveById hanya mengembalikan kolom profil, tanpa field internal", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatUser(`baca${EMAIL_SUFFIX}`);

    const row = await repository.findActiveById(id);

    expect(row).not.toBeNull();
    expect(Object.keys(row!).sort()).toEqual([
      "createdAt",
      "email",
      "fullName",
      "id",
      "phone",
      "role",
    ]);
  });

  it("akun soft-delete tidak terbaca (deletedAt: null wajib)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatUser(`terhapus${EMAIL_SUFFIX}`);
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });

    expect(await repository.findActiveById(id)).toBeNull();
    // Update pun tidak menemukan barisnya → null, bukan melempar.
    expect(await repository.updateProfile(id, { fullName: NAMA_BARU })).toBeNull();
  });

  it("email tidak dikirim → kolom tidak disentuh", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatUser(`tetap${EMAIL_SUFFIX}`);

    const row = await repository.updateProfile(id, { fullName: NAMA_BARU });

    expect(row?.fullName).toBe("Nama Baru");
    expect(row?.email).toBe(`tetap${EMAIL_SUFFIX}`);
  });

  it("email null → dikosongkan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatUser(`dihapus${EMAIL_SUFFIX}`);

    const row = await repository.updateProfile(id, { fullName: NAMA_UJI, email: null });

    expect(row?.email).toBeNull();
  });
});

describe("migrasi 06 — unique parsial email (integration)", () => {
  it("email milik akun AKTIF lain ditolak (EmailSudahDipakaiError)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const email = `bentrok${EMAIL_SUFFIX}`;
    await buatUser(email);
    const penyerang = await buatUser(null);

    // Inilah jalur yang ditutup: menyetel email milik orang lain akan membuat
    // penautan Google (PR-017) mendarat di akun yang salah.
    await expect(
      repository.updateProfile(penyerang, { fullName: NAMA_UJI, email }),
    ).rejects.toThrow(/sudah dipakai/);
  });

  it("PARSIAL: email akun yang sudah dihapus boleh dipakai ulang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const email = `daurulang${EMAIL_SUFFIX}`;
    const lama = await buatUser(email);
    await prisma.user.update({ where: { id: lama }, data: { deletedAt: new Date() } });

    const baru = await buatUser(null);
    const row = await repository.updateProfile(baru, { fullName: NAMA_UJI, email });

    // Hak hapus UU PDP tidak boleh berubah menjadi hukuman seumur hidup atas
    // alamat email sendiri.
    expect(row?.email).toBe(email);
  });

  it("beberapa akun tanpa email hidup berdampingan (NULL tidak bertabrakan)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const a = await buatUser(null);
    const b = await buatUser(null);

    expect(a).not.toBe(b);
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  });

  it("index terpasang dengan predikat parsial yang benar", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'users_email_aktif_key'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toMatch(/UNIQUE/);
    expect(rows[0]?.indexdef).toMatch(/WHERE \(deleted_at IS NULL\)/);
  });
});
