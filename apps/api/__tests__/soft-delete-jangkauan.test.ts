// Penjaga JANGKAUAN soft delete (PR-021a).
//
// KENAPA ADA. Ekstensi `core/db/soft-delete.ts` hanya menjangkau operasi
// top-level model `user`. Tiga hal lolos darinya, dan ketiganya tidak
// menimbulkan gejala apa pun — query berjalan, test hijau, data terhapus
// muncul kembali di satu tempat yang tidak diperiksa siapa pun:
//
//   1. `new PrismaClient()` di luar core/db — klien tanpa ekstensi sama sekali.
//   2. Relasi bersarang: `include: { user: true }` dijalankan sebagai operasi
//      model LAIN, jadi penjaganya tidak pernah dipanggil.
//   3. `$queryRaw` yang menyentuh `users` — melewati seluruh lapisan ekstensi.
//
// Tidak ada API Prisma yang menutup (2) dan (3). Yang bisa dilakukan adalah
// memindahkan kegagalannya ke CI, dan itulah isi file ini.
//
// DIPASANG SELAGI BERSIH. Saat PR-021a ditulis, jumlah pelanggaran di seluruh
// `apps/api/src` adalah NOL — jadi daftar pengecualian di bawah lahir kosong.
// Memasangnya setelah PR-022 (agregator ekspor lintas modul, pemakai `include`
// pertama yang sesungguhnya) berarti memulai dengan daftar yang sudah terisi,
// dan daftar warisan tidak pernah ditinjau siapa pun.
//
// CAKUPAN: `apps/api/src` DAN `apps/worker/src` (diperluas di PR-023, saat
// worker mulai menyentuh Prisma untuk purge PDP — persis syarat yang dicatat
// log PR-021a). `apps/api/prisma/seed.ts` sengaja di luar: ia tidak pernah
// melayani permintaan, hanya mengisi database dev/CI.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(__dirname, "..", "src");
const WORKER_SRC = join(__dirname, "..", "..", "worker", "src");

/** Satu-satunya file yang boleh membangun klien Prisma. */
const PEMBUAT_KLIEN = join("core", "db", "index.ts");

/**
 * Relasi `user` yang SUDAH ditimbang dan diterima. Kosong saat lahir.
 *
 * Menambah entri di sini bukan formalitas: ia berarti ada jalur baca yang
 * penjaganya tidak menjangkau, dan pemanggilnya WAJIB menyaring `deletedAt`
 * sendiri. Tulis alasannya — daftar pengecualian tanpa alasan berubah menjadi
 * tempat sampah dalam dua PR.
 */
const RELASI_DIIZINKAN: ReadonlyArray<{ file: string; alasan: string }> = [];

// ===== Pemindai =====================================================
// Fungsi murni, diuji terhadap contoh di bawah sebelum dilepas ke repo.

/**
 * Buang komentar, PERTAHANKAN string dan baris baru.
 *
 * Wajib: `core/db/soft-delete.ts` memuat `include: { user: true }` di dalam
 * komentar penjelasnya sendiri. Tanpa langkah ini, penjaga akan menuduh
 * dokumentasi yang justru menerangkannya — dan orang akan mematikan penjaganya,
 * bukan memperbaikinya.
 */
export function tanpaKomentar(kode: string): string {
  let hasil = "";
  let mode: "kode" | "baris" | "blok" | "'" | '"' | "`" = "kode";

  for (let i = 0; i < kode.length; i += 1) {
    const c = kode[i] as string;
    const d = kode[i + 1];

    if (mode === "kode") {
      if (c === "/" && d === "/") {
        mode = "baris";
        i += 1;
      } else if (c === "/" && d === "*") {
        mode = "blok";
        i += 1;
      } else if (c === "'" || c === '"' || c === "`") {
        mode = c;
        hasil += c;
      } else {
        hasil += c;
      }
      continue;
    }

    if (mode === "baris") {
      // Baris baru dipertahankan supaya nomor baris laporan tetap jujur.
      if (c === "\n") {
        mode = "kode";
        hasil += c;
      }
      continue;
    }

    if (mode === "blok") {
      if (c === "*" && d === "/") {
        mode = "kode";
        i += 1;
      } else if (c === "\n") {
        hasil += c;
      }
      continue;
    }

    // Di dalam string: escape apa pun ikut apa adanya.
    if (c === "\\") {
      hasil += c + (d ?? "");
      i += 1;
      continue;
    }
    if (c === mode) mode = "kode";
    hasil += c;
  }

  return hasil;
}

/** Isi blok `{...}` yang dimulai di `posisi`; kurung di dalam string diabaikan. */
function blokObjek(kode: string, posisi: number): string {
  let dalam = 0;
  let string: string | null = null;

  for (let i = posisi; i < kode.length; i += 1) {
    const c = kode[i] as string;

    if (string !== null) {
      if (c === "\\") i += 1;
      else if (c === string) string = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      string = c;
      continue;
    }
    if (c === "{") dalam += 1;
    else if (c === "}") {
      dalam -= 1;
      if (dalam === 0) return kode.slice(posisi + 1, i);
    }
  }
  return kode.slice(posisi + 1);
}

function nomorBaris(kode: string, indeks: number): number {
  return kode.slice(0, indeks).split("\n").length;
}

export interface Temuan {
  baris: number;
  kutipan: string;
}

/** `include:`/`select:` yang membaca relasi `user`. */
export function cariRelasiUser(kode: string): Temuan[] {
  const bersih = tanpaKomentar(kode);
  const temuan: Temuan[] = [];
  const pola = /\b(include|select)\s*:\s*\{/g;

  let cocok: RegExpExecArray | null;
  while ((cocok = pola.exec(bersih)) !== null) {
    const kurung = cocok.index + cocok[0].length - 1;
    const isi = blokObjek(bersih, kurung);
    // `userId:` sengaja TIDAK cocok — id adalah kolom skalar, bukan relasi.
    if (!/\buser\s*:/.test(isi)) continue;
    temuan.push({ baris: nomorBaris(bersih, cocok.index), kutipan: `${cocok[1]}: { … user … }` });
  }
  return temuan;
}

/** Raw SQL yang menyentuh tabel `users` tanpa menyaring `deleted_at`. */
export function cariRawSqlUsers(kode: string): Temuan[] {
  const bersih = tanpaKomentar(kode);
  const temuan: Temuan[] = [];
  const pola = /\$(?:query|execute)Raw(?:Unsafe)?\s*[(`]/g;

  let cocok: RegExpExecArray | null;
  while ((cocok = pola.exec(bersih)) !== null) {
    // Ambil sisa pernyataan sampai titik koma — cukup untuk memuat literal SQL
    // dalam bentuk template maupun string biasa.
    const mulai = cocok.index;
    const akhir = bersih.indexOf(";", mulai);
    const sql = bersih.slice(mulai, akhir === -1 ? bersih.length : akhir);

    if (!/\busers\b/i.test(sql)) continue;
    if (/\bdeleted_at\b/i.test(sql)) continue;
    temuan.push({ baris: nomorBaris(bersih, mulai), kutipan: sql.slice(0, 60).replace(/\s+/g, " ") });
  }
  return temuan;
}

/** Pembangunan klien Prisma di luar `core/db`. */
export function cariKlienTakBerpenjaga(kode: string): Temuan[] {
  const bersih = tanpaKomentar(kode);
  const temuan: Temuan[] = [];
  const pola = /new\s+PrismaClient\s*\(/g;

  let cocok: RegExpExecArray | null;
  while ((cocok = pola.exec(bersih)) !== null) {
    temuan.push({ baris: nomorBaris(bersih, cocok.index), kutipan: "new PrismaClient(" });
  }
  return temuan;
}

/** Seluruh berkas TypeScript di bawah sebuah direktori. */
function berkasSumber(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entri) => {
    const penuh = join(dir, entri.name);
    if (entri.isDirectory()) return berkasSumber(penuh);
    return entri.name.endsWith(".ts") ? [penuh] : [];
  });
}

/** `apps/api/src` + `apps/worker/src`, dengan label yang menyebut app-nya. */
const sumber = [
  ...berkasSumber(SRC).map((file) => ({ relatif: relative(SRC, file), isi: readFileSync(file, "utf8") })),
  ...(existsSync(WORKER_SRC) ? berkasSumber(WORKER_SRC) : []).map((file) => ({
    relatif: join("..", "worker", "src", relative(WORKER_SRC, file)),
    isi: readFileSync(file, "utf8"),
  })),
];

// ===== Pemindai diuji lebih dulu ====================================
// Repo hari ini BERSIH, jadi pemeriksaan terhadapnya tidak membuktikan bahwa
// pemindainya bekerja — pemindai yang rusak akan sama hijaunya. Contoh di bawah
// inilah yang membuat penjaga ini tidak lulus secara hampa.

const CONTOH_RELASI_MELANGGAR = `
const daftar = await prisma.application.findMany({
  where: { jobId },
  include: { user: true },
});
`;

const CONTOH_RELASI_AMAN = `
// include: { user: true } — penyebutan di komentar bukan pelanggaran
const daftar = await prisma.application.findMany({
  where: { jobId },
  select: { id: true, userId: true },
});
`;

const CONTOH_SQL_MELANGGAR =
  "const r = await prisma.$queryRaw`SELECT id FROM users WHERE phone = ${nomor}`;";
const CONTOH_SQL_AMAN =
  "const r = await prisma.$queryRaw`SELECT id FROM users WHERE phone = ${nomor} AND deleted_at IS NULL`;";
const CONTOH_SQL_TABEL_LAIN =
  "const r = await prisma.$queryRaw`SELECT count(*) FROM refresh_tokens WHERE user_id = ${id}`;";

describe("pemindai — terbukti menangkap sebelum dilepas ke repo", () => {
  it("menangkap include relasi user, dan tidak salah menuduh komentar", () => {
    expect(cariRelasiUser(CONTOH_RELASI_MELANGGAR)).toHaveLength(1);
    expect(cariRelasiUser(CONTOH_RELASI_AMAN)).toEqual([]);
  });

  it("membedakan `user:` (relasi) dari `userId:` (kolom skalar)", () => {
    // Perbedaan ini yang menentukan apakah penjaganya berguna atau berisik:
    // hampir setiap select di repo ini memuat `userId`.
    expect(cariRelasiUser("x({ select: { userId: true, id: true } })")).toEqual([]);
    expect(cariRelasiUser("x({ select: { user: { select: { id: true } } } })")).toHaveLength(1);
  });

  it("menangkap raw SQL ke users tanpa filter, melewatkan yang menyaring", () => {
    expect(cariRawSqlUsers(CONTOH_SQL_MELANGGAR)).toHaveLength(1);
    expect(cariRawSqlUsers(CONTOH_SQL_AMAN)).toEqual([]);
    expect(cariRawSqlUsers(CONTOH_SQL_TABEL_LAIN)).toEqual([]);
  });

  it("menangkap pembangunan klien Prisma", () => {
    expect(cariKlienTakBerpenjaga("const p = new PrismaClient({ log: [] });")).toHaveLength(1);
    expect(cariKlienTakBerpenjaga("// new PrismaClient() di komentar")).toEqual([]);
  });

  it("membaca berkas sumber yang cukup untuk berarti", () => {
    // Penelusuran direktori yang rusak akan membuat SELURUH pemeriksaan repo di
    // bawah hijau tanpa membuka satu berkas pun.
    expect(sumber.length).toBeGreaterThan(30);
    const daftar = sumber.map((f) => f.relatif);
    expect(daftar).toContain(join("core", "db", "soft-delete.ts"));
    // Cakupan worker (PR-023) — kalau penelusurannya diam-diam berhenti bekerja,
    // purge bisa membangun kliennya sendiri tanpa ada yang menegur.
    expect(daftar).toContain(join("..", "worker", "src", "index.ts"));
  });
});

// ===== Pemeriksaan repo =============================================

describe("jangkauan soft delete — apps/api/src", () => {
  it("klien Prisma hanya dibangun di core/db", () => {
    // Klien tanpa ekstensi melihat SEMUA baris. Ini bypass paling total yang
    // ada — bukan celah sempit seperti dua yang lain, melainkan penjaga yang
    // tidak dipasang sama sekali.
    const pelanggaran = sumber
      .filter((f) => f.relatif !== PEMBUAT_KLIEN)
      .flatMap((f) => cariKlienTakBerpenjaga(f.isi).map((t) => `${f.relatif}:${t.baris}`));

    expect(
      pelanggaran,
      `Bangun klien lewat createPrismaClient() di core/db: ${pelanggaran.join(", ")}`,
    ).toEqual([]);
  });

  it("tidak ada relasi `user` yang dibaca lewat include/select", () => {
    const diizinkan = new Set(RELASI_DIIZINKAN.map((e) => e.file.split("/").join(sep)));
    const pelanggaran = sumber
      .filter((f) => !diizinkan.has(f.relatif))
      .flatMap((f) => cariRelasiUser(f.isi).map((t) => `${f.relatif}:${t.baris} — ${t.kutipan}`));

    expect(
      pelanggaran,
      "Relasi `user` tidak tersaring penjaga soft delete. Baca lewat service modul " +
        `users, atau daftarkan di RELASI_DIIZINKAN beserta alasannya: ${pelanggaran.join(", ")}`,
    ).toEqual([]);
  });

  it("setiap raw SQL yang menyentuh users menyaring deleted_at sendiri", () => {
    const pelanggaran = sumber.flatMap((f) =>
      cariRawSqlUsers(f.isi).map((t) => `${f.relatif}:${t.baris} — ${t.kutipan}`),
    );

    expect(
      pelanggaran,
      `Raw SQL melewati ekstensi Prisma; tambahkan filter deleted_at: ${pelanggaran.join(", ")}`,
    ).toEqual([]);
  });

  it("daftar RELASI_DIIZINKAN tidak menyimpan entri yang sudah tidak melanggar", () => {
    // Arah sebaliknya: entri yang pelanggarannya sudah dibereskan WAJIB dihapus.
    // Tanpa ini, daftar pengecualian hanya bertambah dan pelan-pelan menjadi
    // izin permanen bagi hal yang sudah lama tidak ada.
    const basi = RELASI_DIIZINKAN.filter((e) => {
      const file = sumber.find((f) => f.relatif === e.file.split("/").join(sep));
      return file === undefined || cariRelasiUser(file.isi).length === 0;
    }).map((e) => e.file);

    expect(basi, `Entri berikut sudah tidak melanggar, hapus dari daftar: ${basi.join(", ")}`).toEqual(
      [],
    );
  });
});
