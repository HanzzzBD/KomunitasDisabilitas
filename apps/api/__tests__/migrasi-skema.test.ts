// Penjaga pasangan `schema.prisma` ↔ SQL migrasi (PR-024a).
//
// KENAPA ADA. Migrasi di repo ini DITULIS TANGAN (konvensi prisma/README:
// fitur di luar dukungan Prisma — unique parsial, BRIN — lahir sebagai raw SQL
// di file migrasi). Artinya ada dua tempat yang harus sepakat, dan tidak ada
// apa pun yang memeriksanya: `prisma migrate deploy` hanya menjalankan SQL, dan
// `migrate reset` di CI pun tidak membandingkan hasilnya dengan schema.prisma.
//
// Bentuk kegagalannya diam. Tabel atau index yang dideklarasikan di schema
// tetapi tidak pernah ditulis ke SQL akan ADA di klien Prisma (typecheck lolos,
// autocomplete jalan) dan TIDAK ADA di database. Yang menemukannya adalah
// query pertama di produksi.
//
// Penjaga ini tidak menggantikan `migrate diff` — ia tidak melihat tipe kolom
// maupun urutan. Yang dijamin hanya: setiap nama tabel dan setiap nama index
// yang disebut schema BENAR-BENAR muncul di suatu file migrasi.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { bacaSchemaPrisma } from "./helpers/prisma-schema.js";

const MIGRASI = join(__dirname, "..", "prisma", "migrations");

const schema = bacaSchemaPrisma();

/** Seluruh SQL migrasi digabung — urutan tidak penting untuk pemeriksaan ini. */
const sql = readdirSync(MIGRASI)
  .filter((nama) => statSync(join(MIGRASI, nama)).isDirectory())
  .map((nama) => readFileSync(join(MIGRASI, nama, "migration.sql"), "utf8"))
  .join("\n");

/** Nama tabel dari `@@map("...")`. */
const tabel = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((m) => m[1] as string);

/**
 * Nama index yang DINAMAI eksplisit lewat `map:`. Hanya yang bernama yang bisa
 * diperiksa — index tanpa `map:` diberi nama otomatis oleh Prisma dan namanya
 * tidak tertulis di schema.
 */
const indexBernama = [...schema.matchAll(/@@(?:index|unique)\([^)]*map:\s*"([^"]+)"/g)].map(
  (m) => m[1] as string,
);

describe("schema.prisma ↔ SQL migrasi", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    // Regex yang tidak cocok lagi akan membuat kedua daftar kosong dan seluruh
    // pemeriksaan di bawah hijau tanpa memeriksa apa pun.
    expect(tabel.length).toBeGreaterThan(10);
    expect(indexBernama.length).toBeGreaterThan(0);
    expect(sql.length).toBeGreaterThan(1000);
  });

  it("setiap tabel yang dideklarasikan punya CREATE TABLE di migrasi", () => {
    const hilang = tabel.filter((t) => !new RegExp(`CREATE TABLE "${t}"`, "i").test(sql));

    expect(
      hilang,
      `Tabel berikut ada di schema.prisma tetapi tidak pernah dibuat migrasi mana pun — ` +
        `klien Prisma akan mengenalnya sementara database tidak: ${hilang.join(", ")}`,
    ).toEqual([]);
  });

  it("setiap index bernama punya CREATE INDEX di migrasi", () => {
    // Index BRIN dan unique parsial ditulis tangan (prisma/README). Yang
    // terlewat tidak menimbulkan error apa pun — hanya query yang pelan, atau
    // constraint yang ternyata tidak pernah ada.
    const hilang = indexBernama.filter((i) => !sql.includes(`"${i}"`));

    expect(
      hilang,
      `Index berikut dinamai di schema.prisma tetapi tidak ada di SQL migrasi: ${hilang.join(", ")}`,
    ).toEqual([]);
  });

  it("BRIN pendukung retensi benar-benar terpasang (PR-024a)", () => {
    // Diperiksa spesifik karena keduanya adalah SYARAT yang ditulis file phase,
    // bukan optimasi opsional: tanpanya purge harian men-seq-scan tabel yang
    // terus tumbuh.
    expect(sql).toMatch(/CREATE INDEX "refresh_tokens_revoked_at_brin".*USING BRIN/i);
    expect(sql).toMatch(/CREATE INDEX "refresh_tokens_expires_at_brin".*USING BRIN/i);
  });
});

/**
 * Indeks yang BOLEH dihapus sebuah migrasi, beserta alasannya.
 *
 * Kosong hari ini, dan itu memang keadaan yang benar: belum ada satu pun indeks
 * yang pernah sengaja dihapus di repo ini.
 */
const DROP_INDEX_DISENGAJA: Readonly<Record<string, string>> = {};

describe("tidak ada migrasi yang menghapus indeks tanpa keputusan (PR-048a)", () => {
  // KENAPA PENJAGA INI ADA — dan ia lahir dari kejadian nyata, bukan kehati-
  // hatian abstrak.
  //
  // Sebagian indeks repo ini dibuat lewat RAW SQL di migrasi 03 karena Prisma
  // tidak bisa menyatakannya: HNSW pgvector, GIN, trigram, dan beberapa indeks
  // komposit. Karena tidak terwakili di schema.prisma, `prisma migrate dev`
  // membacanya sebagai DRIFT dan dengan patuh menuliskan `DROP INDEX` untuk
  // "merapikannya" — di TENGAH migrasi yang sebenarnya hanya menambah tabel.
  //
  // Itu terjadi saat menyiapkan PR-048a (2026-09-05): migrasi yang seharusnya
  // hanya membuat `devices` menghasilkan TUJUH `DROP INDEX`, dan menjatuhkannya
  // di DB dev sebelum ketahuan. Bila lolos ke produksi, pencarian lowongan dan
  // job matching berubah menjadi seq scan — tanpa satu pun error, tanpa satu pun
  // test merah. Hanya lambat, dan hanya saat data sudah banyak.
  //
  // Penjaga ini tidak memperbaiki sebabnya (utang U-15: deklarasikan indeks yang
  // representable di schema.prisma). Yang ia jamin: sebab itu tidak bisa lagi
  // menghasilkan akibat tanpa seseorang menuliskan keputusannya lebih dulu.
  /**
   * Komentar `--` DIBUANG sebelum dipindai, dan itu bukan detail.
   *
   * Migrasi 06 menuliskan *"Rollback = DROP INDEX ..."* di dalam komentarnya —
   * kalimat penjelas, bukan pernyataan. Penjaga yang memindai teks mentah akan
   * menuduhnya menghapus indeks, dan penjaga yang menuduh secara keliru adalah
   * penjaga yang pertama kali dilonggarkan orang saat ia menghalangi.
   */
  const tanpaKomentar = (isi: string): string =>
    isi
      .split("\n")
      .map((baris) => baris.replace(/--.*$/, ""))
      .join("\n");

  const berkas = readdirSync(MIGRASI)
    .filter((nama) => statSync(join(MIGRASI, nama)).isDirectory())
    .map((nama) => ({
      nama,
      isi: tanpaKomentar(readFileSync(join(MIGRASI, nama, "migration.sql"), "utf8")),
    }));

  it("penjaga ini tidak lulus secara hampa", () => {
    expect(berkas.length).toBeGreaterThanOrEqual(14);
  });

  it("setiap DROP INDEX terdaftar sebagai keputusan sadar", () => {
    const temuan: string[] = [];

    for (const { nama, isi } of berkas) {
      for (const cocok of isi.matchAll(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?"?([\w.]+)"?/gi)) {
        const indeks = (cocok[1] as string).replace(/^public\./, "");
        if (!(indeks in DROP_INDEX_DISENGAJA)) temuan.push(`${nama} → ${indeks}`);
      }
    }

    expect(
      temuan,
      "Migrasi berikut menghapus indeks tanpa keputusan tertulis. Bila Anda TIDAK " +
        "sengaja menuliskannya, ini hampir pasti drift yang dikarang `prisma migrate dev` " +
        "atas indeks raw-SQL migrasi 03 — hapus barisnya dari migrasi. Bila memang " +
        "disengaja, daftarkan di DROP_INDEX_DISENGAJA beserta alasannya:\n" +
        temuan.join("\n"),
    ).toEqual([]);
  });

  it("indeks raw-SQL yang tak terwakili schema tetap ada di SQL migrasi", () => {
    // Arah sebaliknya, dan perlu terpisah: penjaga di atas hanya melihat DROP.
    // Indeks yang hilang karena migrasinya DIEDIT (bukan di-drop) tidak akan
    // tertangkap olehnya — sedangkan akibatnya bagi produksi persis sama.
    for (const indeks of [
      "jobs_embedding_hnsw",
      "seeker_profiles_embedding_hnsw",
      "jobs_fts_gin",
      "jobs_title_trgm",
      "jobs_accommodations_gin",
      "notifications_unread",
      "applications_user_updated",
      "applications_job_status",
      "jobs_status_published_at",
    ]) {
      expect(sql, `indeks "${indeks}" hilang dari SQL migrasi`).toContain(`"${indeks}"`);
    }
  });
});
