// Penjaga konvensi `prisma/README.md` §2: setiap folder migrasi wajib punya
// `down.sql` manual, sebab Prisma tidak meng-generate-nya.
//
// ALASAN BERKAS INI ADA. Aturan itu ditulis sejak PR-009, lalu dilanggar diam-
// diam oleh TUJUH migrasi berturut-turut (04–10): hanya 01–03 yang punya
// `down.sql`. Tidak ada yang menahannya, sebab aturannya hanya hidup di prosa
// README — dan prosa tidak menjatuhkan build.
//
// Akibatnya bukan kerapian: RB-Std (CLAUDE.md §5.7) menjanjikan rollback, dan
// selama tujuh migrasi janji itu tidak punya dasar. Rollback yang baru ditulis
// saat insiden adalah rollback yang belum pernah diuji.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../prisma/migrations", import.meta.url));

const folderMigrasi = (): string[] =>
  readdirSync(DIR)
    .filter((nama) => statSync(join(DIR, nama)).isDirectory())
    .sort();

describe("konvensi migrasi (prisma/README.md §2)", () => {
  it("ada migrasi untuk diperiksa — penjaga atas penjaga", () => {
    // Tanpa ini, direktori yang salah jalan membuat seluruh berkas hijau
    // dengan memeriksa nol folder.
    expect(folderMigrasi().length).toBeGreaterThanOrEqual(11);
  });

  it("SETIAP folder migrasi punya down.sql", () => {
    const tanpaDown = folderMigrasi().filter(
      (nama) => !readdirSync(join(DIR, nama)).includes("down.sql"),
    );

    expect(
      tanpaDown,
      `Migrasi tanpa down.sql (prisma/README.md §2 mewajibkannya):\n${tanpaDown.join("\n")}`,
    ).toEqual([]);
  });

  it("down.sql memuat pernyataan SQL, bukan hanya komentar", () => {
    // Migrasi 09 pernah menulis SQL turunnya sebagai KOMENTAR di dalam
    // migration.sql — terbaca seperti sudah dipikirkan, tetapi tidak bisa
    // dijalankan siapa pun. Berkas yang seluruhnya komentar mengulangi
    // kekeliruan itu dengan nama berkas yang benar.
    const hampa = folderMigrasi().filter((nama) => {
      const isi = readFileSync(join(DIR, nama, "down.sql"), "utf8");
      const perintah = isi
        .split("\n")
        .map((baris) => baris.trim())
        .filter((baris) => baris !== "" && !baris.startsWith("--"));
      return perintah.length === 0;
    });

    expect(hampa, `down.sql tanpa satu pun pernyataan:\n${hampa.join("\n")}`).toEqual([]);
  });
});
