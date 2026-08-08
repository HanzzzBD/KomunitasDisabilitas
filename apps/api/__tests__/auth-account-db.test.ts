// Integration DB hapus akun (PR-021) — butuh PostgreSQL hidup.
// Skip otomatis bila DB tidak terjangkau (pola sama dengan test DB lain).
//
// INILAH tempat AC "tidak ada query modul mana pun mengembalikan user terhapus"
// benar-benar dibuktikan. Dua klien dipakai berdampingan dan perbedaannya
// adalah seluruh isi test ini:
//
//   `berpenjaga` = createPrismaClient()  → klien aplikasi, ekstensi terpasang
//   `mentah`     = new PrismaClient()    → tanpa ekstensi, melihat apa adanya
//
// Tanpa `mentah`, "baris tidak ditemukan" tidak bisa dibedakan dari "baris
// memang sudah tidak ada" — dan test akan sama hijaunya andai penghapusannya
// ternyata hard delete, yang justru membatalkan janji purge ≤ 30 hari.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createAuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";
import { createUserProfileRepository } from "../src/modules/users/index.js";

const mentah = new PrismaClient();
const berpenjaga = createPrismaClient();

const authRepository = createAuthUserRepository(berpenjaga);
const profilRepository = createUserProfileRepository(berpenjaga);

/** Penanda khusus test supaya pembersihan tidak menyentuh data lain. */
const NAMA_UJI = "Uji PR-021";
let dbTersedia = false;

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test hapus akun dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    // Lewat `mentah`: baris yang sudah soft-delete tidak terlihat oleh klien
    // ber-penjaga pada operasi baca, dan pembersihan yang setengah jalan akan
    // membuat test berikutnya gagal karena nomor uji masih terpakai.
    await mentah.user.deleteMany({ where: { fullName: { startsWith: NAMA_UJI } } });
  }
  await Promise.all([mentah.$disconnect(), berpenjaga.$disconnect()]);
});

let urutan = 0;
/** Nomor unik per pemanggilan — unique parsial `users_phone_key` tetap dihormati. */
function nomorBaru(): string {
  urutan += 1;
  return `+62811000${String(urutan).padStart(4, "0")}`;
}

async function buatAkun(opsi: { sesiHidup?: number } = {}): Promise<{ id: string; phone: string }> {
  const id = uuidV7();
  const phone = nomorBaru();
  await mentah.user.create({ data: { id, fullName: NAMA_UJI, phone } });

  for (let i = 0; i < (opsi.sesiHidup ?? 0); i += 1) {
    await mentah.refreshToken.create({
      data: {
        id: uuidV7(),
        userId: id,
        tokenHash: `hash-${id}-${i}`,
        familyId: uuidV7(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  }
  return { id, phone };
}

describe("deleteAccount — satu transaksi, dua tabel (integration)", () => {
  it("menandai deleted_at, menaikkan token_version, dan mencabut semua sesi sekaligus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { id } = await buatAkun({ sesiHidup: 3 });
    const saat = new Date();

    const hasil = await authRepository.deleteAccount(id, saat);

    expect(hasil).toEqual({ tokenVersion: 1, revokedCount: 3 });

    const baris = await mentah.user.findUnique({ where: { id } });
    expect(baris?.deletedAt?.getTime()).toBe(saat.getTime());
    expect(baris?.tokenVersion).toBe(1);

    const sesi = await mentah.refreshToken.findMany({ where: { userId: id } });
    expect(sesi).toHaveLength(3);
    expect(sesi.every((r) => r.revokedAt !== null)).toBe(true);
    expect(sesi.every((r) => r.revokedReason === "account_deleted")).toBe(true);
  });

  it("baris users TETAP ADA — menunggu purge ≤ 30 hari (AC)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { id } = await buatAkun();

    await authRepository.deleteAccount(id, new Date());

    // Dibaca lewat klien mentah: inilah satu-satunya cara membedakan
    // "disembunyikan penjaga" dari "benar-benar hilang".
    expect(await mentah.user.findUnique({ where: { id } })).not.toBeNull();
  });

  it("panggilan kedua mengembalikan null dan tidak menyentuh sesi lagi", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { id } = await buatAkun({ sesiHidup: 2 });
    const pertama = new Date("2026-08-01T00:00:00.000Z");

    expect(await authRepository.deleteAccount(id, pertama)).toEqual({
      tokenVersion: 1,
      revokedCount: 2,
    });
    expect(await authRepository.deleteAccount(id, new Date())).toBeNull();

    // Tidak ada efek samping dari panggilan yang kalah: `deleted_at` masih
    // menunjuk penghapusan pertama, dan `token_version` tidak naik dua kali —
    // itulah gunanya `deleted_at IS NULL` ada di klausa WHERE, bukan hanya
    // diperiksa lebih dahulu di service.
    const baris = await mentah.user.findUnique({ where: { id } });
    expect(baris?.deletedAt?.getTime()).toBe(pertama.getTime());
    expect(baris?.tokenVersion).toBe(1);
  });
});

describe("penjaga soft delete — lintas modul (AC)", () => {
  it("repository auth DAN users sama-sama buta terhadap akun terhapus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { id, phone } = await buatAkun();

    // Sebelum: kedua modul melihatnya.
    expect(await authRepository.findActiveSessionUser(id)).not.toBeNull();
    expect(await profilRepository.findActiveById(id)).not.toBeNull();

    await authRepository.deleteAccount(id, new Date());

    // Sesudah: keduanya buta — login ditolak, refresh ditolak, profil hilang.
    expect(await authRepository.findActiveSessionUser(id)).toBeNull();
    expect(await authRepository.findActiveByPhone(phone)).toBeNull();
    expect(await profilRepository.findActiveById(id)).toBeNull();
  });

  it("query tanpa filter apa pun tetap tidak melihatnya — penjaganya terpasang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { id } = await buatAkun();
    await authRepository.deleteAccount(id, new Date());

    // Tiga bentuk query yang TIDAK menyebut deletedAt sama sekali. Inilah yang
    // membedakan penjaga sungguhan dari disiplin per-query: repository baru yang
    // lupa menyaring tetap tidak bisa membocorkan baris ini.
    expect(await berpenjaga.user.findUnique({ where: { id } })).toBeNull();
    expect(await berpenjaga.user.findFirst({ where: { id } })).toBeNull();
    expect(await berpenjaga.user.count({ where: { id } })).toBe(0);

    // Klien mentah melihatnya — jadi yang menyembunyikan memang ekstensinya,
    // bukan ketiadaan barisnya.
    expect(await mentah.user.findUnique({ where: { id } })).not.toBeNull();
  });

  it("tulis pun tertahan: akun terhapus tidak bisa diubah lagi", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { id } = await buatAkun();
    await authRepository.deleteAccount(id, new Date());

    const hasil = await berpenjaga.user.updateMany({
      where: { id },
      data: { fullName: `${NAMA_UJI} Diubah` },
    });

    expect(hasil.count).toBe(0);
    expect((await mentah.user.findUnique({ where: { id } }))?.fullName).toBe(NAMA_UJI);
  });

  it("query yang MEMANG mencari baris terhapus tetap bisa (jalan purge PR-023)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { id } = await buatAkun();
    await authRepository.deleteAccount(id, new Date());

    // Menyebut `deletedAt` sendiri = pernyataan sadar; penjaga tidak menimpanya.
    const kandidat = await berpenjaga.user.findFirst({ where: { id, deletedAt: { not: null } } });
    expect(kandidat?.id).toBe(id);

    // Dan penghapusan permanen tidak pernah disaring — tanpa ini, job purge
    // tidak akan pernah bisa menepati janji "data hilang ≤ 30 hari".
    const dihapus = await berpenjaga.user.deleteMany({ where: { id } });
    expect(dihapus.count).toBe(1);
  });

  it("nomor HP bebas dipakai ulang setelah akun dihapus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { id, phone } = await buatAkun();
    await authRepository.deleteAccount(id, new Date());

    // Unique index nomor bersifat PARSIAL (`WHERE deleted_at IS NULL`, migrasi
    // 01) — kalau tidak, akun yang dihapus akan mengunci nomor pemiliknya
    // selamanya dan hak hapus PDP berbalik merugikan orang yang memakainya.
    const baru = await authRepository.findOrCreateByPhone(phone);

    expect(baru.isNew).toBe(true);
    expect(baru.id).not.toBe(id);
    await mentah.user.delete({ where: { id: baru.id } });
  });
});
