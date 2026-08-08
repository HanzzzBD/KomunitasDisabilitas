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
