// AC PR-031 nomor 3: "Registry halaman mudah ditambah per PR fitur".
//
// "Mudah ditambah" tidak cukup — yang mudah ditambah juga mudah ditambah
// SALAH. Penjaga ini berjalan di vitest (bukan Playwright) supaya kesalahan
// bentuk registry ketahuan di gerbang yang murah, sebelum satu peramban pun
// dinyalakan.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HALAMAN } from "../e2e/halaman.js";
import { ruteApp } from "../src/app/routes.js";
import type { RouteObject } from "react-router";

describe("bentuk registry", () => {
  it("tidak kosong", () => {
    // Registry kosong membuat SELURUH gerbang lapis ketiga lulus tanpa
    // memeriksa satu halaman pun.
    expect(HALAMAN.length).toBeGreaterThan(0);
  });

  it("setiap nama unik — laporan CI harus bisa menunjuk satu halaman", () => {
    const nama = HALAMAN.map((h) => h.nama);
    expect(nama).toHaveLength(new Set(nama).size);
  });

  it("setiap jalur diawali /", () => {
    for (const h of HALAMAN) {
      expect(h.jalur.startsWith("/"), `"${h.nama}" jalurnya tidak diawali /`).toBe(true);
    }
  });

  it("setiap pengecualian aturan membawa alasan tertulis", () => {
    // Sebab yang sama dengan `TAK_BISA_DI_JSDOM`: pengecualian tanpa alasan
    // berubah jadi pengecualian permanen yang tidak ada yang berani hapus.
    for (const h of HALAMAN) {
      for (const [aturan, alasan] of Object.entries(h.matikan ?? {})) {
        expect(alasan.trim(), `"${h.nama}" mematikan ${aturan} tanpa alasan`).not.toBe("");
      }
    }
  });
});

describe("registry mengikuti route yang benar-benar ada", () => {
  /** Jalur route produksi, diratakan dari `ruteApp`. */
  function jalurRute(): string[] {
    const induk = ruteApp[0] as RouteObject;
    return ((induk.children ?? []) as RouteObject[])
      .filter((r) => r.path !== undefined && r.path !== "*")
      .map((r) => `/${r.path ?? ""}`);
  }

  it("setiap halaman terdaftar menunjuk route yang ada (atau catch-all 404)", () => {
    // Registry yang menunjuk jalur mati akan memeriksa halaman 404 sambil
    // mengira sedang memeriksa halaman fitur — gerbang yang hijau atas
    // halaman yang salah.
    const rute = new Set([...jalurRute(), "/"]);
    const catchAll = HALAMAN.filter((h) => h.nama === "404").map((h) => h.jalur);

    for (const h of HALAMAN) {
      if (catchAll.includes(h.jalur)) continue;
      const jalurTanpaQuery = h.jalur.split("?")[0] ?? h.jalur;
      expect(
        rute.has(jalurTanpaQuery),
        `"${h.nama}" (${jalurTanpaQuery}) bukan route mana pun`,
      ).toBe(true);
    }
  });

  it("setiap route halaman produksi ADA di registry", () => {
    // Arah sebaliknya, dan inilah yang menahan erosi: halaman baru yang lahir
    // tanpa entri registry lolos dari gerbang lapis ketiga tanpa satu pun
    // gejala. Menambah route KINI memaksa menambah entri.
    const terdaftar = new Set(HALAMAN.map((h) => h.jalur.split("?")[0] ?? h.jalur));

    for (const jalur of jalurRute()) {
      expect(terdaftar.has(jalur), `route ${jalur} belum ada di e2e/halaman.ts`).toBe(true);
    }
  });
});

describe("gerbangnya benar-benar terpasang di CI", () => {
  const akar = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const alurKerja = readFileSync(resolve(akar, ".github/workflows/pr.yml"), "utf8");

  it("job a11y TIDAK lagi dimatikan", () => {
    // Slot `if: ${{ false }}` dipesan sejak PR-003. Gerbang yang ditulis tetapi
    // tidak pernah berjalan adalah bentuk paling mahal dari rasa aman palsu:
    // ia terlihat di repo, disebut di dokumen, dan tidak menjaga apa pun.
    const blokA11y = alurKerja.slice(alurKerja.indexOf("\n  a11y:"));
    expect(blokA11y).not.toMatch(/if:\s*\$\{\{\s*false\s*\}\}/);
  });

  it("job a11y menjalankan Playwright DAN Lighthouse", () => {
    const blokA11y = alurKerja.slice(alurKerja.indexOf("\n  a11y:"));
    expect(blokA11y).toContain("test:a11y");
    expect(blokA11y).toContain("test:lighthouse");
  });

  it("nama check-nya PERSIS 'a11y' — tanpa spasi atau tanda kurung", () => {
    // Required status check di ruleset dicocokkan sebagai STRING, dan GitHub
    // tidak menghubungkan nama lama dengan nama baru. Mengganti nama job —
    // bahkan sekadar merapikan tanda baca — akan diam-diam melepas
    // kewajibannya: yang tersisa adalah aturan yang menunggu check yang tidak
    // pernah lagi dilaporkan, dan PR yang menggantung tanpa sebab terlihat.
    //
    // Penjaga ini menahan penyuntingan itu di tempat yang murah, bukan di
    // PR orang lain yang tiba-tiba tidak bisa di-merge.
    const blokA11y = alurKerja.slice(alurKerja.indexOf("\n  a11y:"));
    const baris = /^\s{4}name:\s*(.+?)\s*$/m.exec(blokA11y);

    expect(baris?.[1], "job a11y kehilangan field `name:`").toBeDefined();
    expect(
      baris?.[1],
      "nama check a11y berubah — ruleset `required_status_checks` harus ikut diperbarui, " +
        "atau kewajibannya lepas tanpa gejala",
    ).toBe("a11y");
  });
});
