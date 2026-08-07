// Unit penjaga soft delete (PR-021) — fungsi murni, tanpa database.
//
// Yang diuji di sini adalah KEPUTUSANNYA: operasi mana yang disaring, operasi
// mana yang sengaja dibiarkan, dan kapan pemanggil dianggap sudah bicara
// sendiri. Bahwa keputusan itu benar-benar terpasang pada klien Prisma nyata
// hanya bisa dibuktikan terhadap PostgreSQL — lihat auth-account-db.test.ts.
import { describe, it, expect } from "vitest";
import {
  OPERASI_DILEWATI,
  OPERASI_DISARING,
  terapkanFilterAktif,
} from "../src/core/db/soft-delete.js";

describe("terapkanFilterAktif — operasi baca & tulis disaring", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    // Daftar yang tak sengaja kosong akan membuat SELURUH test "disaring" di
    // bawah lulus tanpa memeriksa apa pun, sebab tidak ada yang diiterasi.
    expect(OPERASI_DISARING.length).toBeGreaterThan(8);
    expect(OPERASI_DISARING).toContain("findFirst");
    expect(OPERASI_DISARING).toContain("findMany");
  });

  it("menyisipkan deletedAt: null pada setiap operasi yang disaring", () => {
    for (const operation of OPERASI_DISARING) {
      const hasil = terapkanFilterAktif(operation, { where: { id: "u1" } });
      expect(hasil, `operasi ${operation}`).toEqual({ where: { id: "u1", deletedAt: null } });
    }
  });

  it("menyaring juga saat query tidak punya where sama sekali", () => {
    // `findMany()` telanjang adalah bentuk paling mudah membocorkan baris
    // terhapus — justru itu yang harus tetap tertutup.
    expect(terapkanFilterAktif("findMany", undefined)).toEqual({ where: { deletedAt: null } });
    expect(terapkanFilterAktif("count", {})).toEqual({ where: { deletedAt: null } });
  });

  it("tidak membuang syarat lain di where, termasuk select dan data", () => {
    const hasil = terapkanFilterAktif("update", {
      where: { id: "u1", email: "a@b.c" },
      data: { fullName: "Baru" },
      select: { id: true },
    });

    expect(hasil).toEqual({
      where: { id: "u1", email: "a@b.c", deletedAt: null },
      data: { fullName: "Baru" },
      select: { id: true },
    });
  });
});

describe("terapkanFilterAktif — jalan keluar yang terlihat di tempat panggilan", () => {
  it("menghormati deletedAt yang sudah ditulis pemanggil", () => {
    // Repository yang sudah menyaring sendiri tidak boleh ditimpa — nilainya
    // sama, tetapi menimpa berarti penjaga ini diam-diam menjadi satu-satunya
    // sumber kebenaran dan filter eksplisit di repo kehilangan artinya.
    const args = { where: { id: "u1", deletedAt: null } };
    expect(terapkanFilterAktif("findFirst", args)).toBe(args);
  });

  it("membiarkan query yang MEMANG mencari baris terhapus (purge, PR-023)", () => {
    const args = { where: { deletedAt: { lt: new Date("2026-01-01") } } };
    // Objek yang sama dikembalikan, bukan salinan: tidak ada kesempatan bagi
    // filter tersembunyi untuk ikut menempel.
    expect(terapkanFilterAktif("findMany", args)).toBe(args);
  });
});

describe("terapkanFilterAktif — operasi yang sengaja dibiarkan", () => {
  it("tidak menyentuh create/delete apa pun bentuk argumennya", () => {
    for (const operation of OPERASI_DILEWATI) {
      const args = { where: { id: "u1" }, data: { fullName: "X" } };
      expect(terapkanFilterAktif(operation, args), `operasi ${operation}`).toBe(args);
    }
  });

  it("delete dan deleteMany tetap bisa menjangkau baris terhapus", () => {
    // Kalau keduanya ikut disaring, job purge (PR-023) tidak akan pernah bisa
    // menghapus apa pun — dan janji "data hilang ≤ 30 hari" gagal diam-diam.
    expect(OPERASI_DILEWATI).toContain("delete");
    expect(OPERASI_DILEWATI).toContain("deleteMany");
    for (const operation of OPERASI_DILEWATI) {
      expect(OPERASI_DISARING).not.toContain(operation);
    }
  });

  it("operasi yang tidak dikenal dilewatkan apa adanya", () => {
    // Versi Prisma baru bisa menambah operasi; yang belum ditimbang manusia
    // tidak boleh diam-diam ikut dimodifikasi.
    const args = { where: { id: "u1" } };
    expect(terapkanFilterAktif("operasiMasaDepan", args)).toBe(args);
  });
});
