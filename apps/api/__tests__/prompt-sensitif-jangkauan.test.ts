// Penjaga JANGKAUAN masukan prompt (PR-044a).
//
// KENAPA ADA. `PeriksaTanpaDisabilitas` (core/ai/prompts/tipe.ts) menolak
// `disabilityTypes` di masukan template saat `tsc` berjalan. Tetapi jaminan itu
// hanya sekuat DUA hal yang TypeScript sendiri tidak bisa jaga:
//
//   (1) Ia tripwire NAMA. Sebuah berkas template bebas menulis
//       `` `disabilityTypes: ${x}` `` di dalam sebuah string dan mengirimkannya
//       ke model tanpa satu pun tipe yang tersinggung.
//   (2) Batasnya menempel di `definePrompt`. Siapa pun yang merakit
//       `AiChatRequest` sendiri di luar `core/ai/prompts/` melewati batas itu
//       seluruhnya, dan tidak ada yang berubah merah.
//
// Penjaga PR-039 (`akses-sensitif-jangkauan.test.ts`) TIDAK menutupi keduanya:
// ia hanya mencocokkan literal `findSensitiveByUserId`, yang tidak pernah
// disentuh PR ini. Jadi tanpa berkas ini, aturan tipe di atas hanyalah
// konvensi — dan konvensi tanpa penjaga adalah konvensi yang akan dilanggar
// oleh PR fitur pertama yang terburu-buru.
//
// DIPASANG SELAGI BERSIH, pola yang sama seperti soft-delete (PR-021a) dan
// akses sensitif (PR-039): hari ini folder prompt berisi satu spesimen, jadi
// daftarnya lahir kecil dan setiap tambahan menjadi keputusan yang terlihat.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { tanpaKomentar } from "./pemindai-kode.js";

const SRC = join(__dirname, "..", "src");
const PROMPTS = join(SRC, "core", "ai", "prompts");
const MODULES = join(SRC, "modules");

/** Ejaan yang dilarang muncul di masukan prompt — camelCase dan kolom DB. */
const KUNCI_TERLARANG = ["disabilityTypes", "disability_types"] as const;

/**
 * Berkas di dalam `prompts/` yang BOLEH menyebut kunci terlarang di kode, dan
 * kenapa. Hanya satu, dan alasannya satu-satunya yang sah: ia yang MENDEFINISIKAN
 * larangannya. Menambah entri di sini berarti ada template yang menyentuh nama
 * field disabilitas — dan jawaban yang benar hampir selalu "jangan kirim
 * fieldnya", bukan "tambahkan ke daftar".
 */
const DIIZINKAN_MENYEBUT: ReadonlyArray<{ file: string; alasan: string }> = [
  {
    file: "tipe.ts",
    alasan:
      "tempat larangannya didefinisikan (KunciDisabilitas); tanpa literalnya di sini tidak ada yang bisa ditolak TypeScript",
  },
];

const bolehMenyebut = new Set(DIIZINKAN_MENYEBUT.map((d) => d.file));

/**
 * Pemanggilan `definePrompt` — sengaja mencocokkan SINTAKS panggilan
 * (`definePrompt(` atau `definePrompt<`), bukan sekadar namanya, supaya
 * re-ekspor di barrel `core/ai/index.ts` tidak dituduh sebagai pemanggil.
 */
const POLA_PANGGILAN = /definePrompt\s*[(<]/;

function berkasTs(dir: string): string[] {
  const hasil: string[] = [];
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    const penuh = join(dir, entri.name);
    if (entri.isDirectory()) hasil.push(...berkasTs(penuh));
    else if (entri.name.endsWith(".ts")) hasil.push(penuh);
  }
  return hasil;
}

function kode(file: string): string {
  return tanpaKomentar(readFileSync(file, "utf8"));
}

describe("jangkauan data disabilitas di template prompt", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    // Tiga cara penjaga ini bisa hijau tanpa memeriksa apa pun: folder prompt
    // dipindahkan, konvensi nama berkas `<nama>.vN.ts` ditinggalkan, atau
    // `definePrompt` diganti nama. Ketiganya ditangkap di sini.
    const isi = berkasTs(PROMPTS).map((f) => relative(PROMPTS, f));
    expect(isi.filter((f) => /\.v\d+\.ts$/.test(f)).length).toBeGreaterThan(0);
    expect(berkasTs(SRC).filter((f) => POLA_PANGGILAN.test(kode(f))).length).toBeGreaterThan(0);
    // Berkas yang diizinkan menyebut kunci terlarang harus benar-benar
    // menyebutnya — kalau tidak, izinnya sudah basi.
    for (const d of DIIZINKAN_MENYEBUT) {
      const teks = kode(join(PROMPTS, d.file));
      expect(KUNCI_TERLARANG.some((k) => teks.includes(k))).toBe(true);
    }
  });

  it("tidak ada template yang menyebut nama field disabilitas di kode", () => {
    const pelanggar = berkasTs(PROMPTS)
      .map((f) => relative(PROMPTS, f))
      .filter((f) => !bolehMenyebut.has(f))
      .filter((f) => {
        const teks = kode(join(PROMPTS, f));
        return KUNCI_TERLARANG.some((k) => teks.includes(k));
      });

    expect(
      pelanggar,
      `Berkas template berikut menyebut nama field data disabilitas di KODE. ` +
        `SDD §7.3: prompt tidak pernah memuat disabilitas mentah — yang boleh ` +
        `hanya kebutuhan akomodasi fungsional, bila fitur memerlukannya dan ` +
        `pengguna sudah consent (docs/akses-data-sensitif.md). Buang fieldnya, ` +
        `atau daftarkan di apps/api/__tests__/prompt-sensitif-jangkauan.test.ts ` +
        `berikut alasannya: ${pelanggar.join(", ")}`,
    ).toEqual([]);
  });

  it("setiap alasan benar-benar ditulis, bukan diisi seadanya", () => {
    const pendek = DIIZINKAN_MENYEBUT.filter((d) => d.alasan.trim().length < 20);
    expect(pendek.map((d) => d.file)).toEqual([]);
  });
});

describe("jangkauan definePrompt", () => {
  it("hanya berkas di core/ai/prompts yang memanggil definePrompt", () => {
    const prefiksPrompts = relative(SRC, PROMPTS) + sep;
    const liar = berkasTs(SRC)
      .filter((f) => POLA_PANGGILAN.test(kode(f)))
      .map((f) => relative(SRC, f))
      .filter((f) => !f.startsWith(prefiksPrompts));

    expect(
      liar,
      `Template prompt hanya boleh lahir di src/core/ai/prompts/ — di sanalah ` +
        `konvensi versi, registry, dan batas tipe data disabilitas berlaku. ` +
        `Berkas berikut memanggil definePrompt di luar folder itu: ${liar.join(", ")}`,
    ).toEqual([]);
  });

  it("spesimen tidak dipakai sebagai prompt produk", () => {
    // `spesimen.v1` ada untuk membuktikan mekanismenya, bukan untuk dipakai
    // fitur. Prompt fitur lahir di PR-066/067/072/087 dengan template sendiri.
    const pemakai = berkasTs(MODULES)
      .filter((f) => kode(f).includes("spesimen"))
      .map((f) => relative(MODULES, f));

    expect(
      pemakai,
      `spesimen.v1 adalah contoh mekanisme, bukan prompt produk. Tulis template ` +
        `tersendiri di src/core/ai/prompts/: ${pemakai.join(", ")}`,
    ).toEqual([]);
  });
});

describe("pemindai", () => {
  it("membedakan kode dari komentar", () => {
    // Komentar di `tipe.ts` dan di berkas ini menyebut nama field terlarang
    // sebagai prosa. Penjaga yang menuduh dokumentasinya sendiri akan dimatikan
    // orang, bukan diperbaiki.
    expect(tanpaKomentar(`// ${KUNCI_TERLARANG[0]}\nconst x = 1;`)).not.toContain(
      KUNCI_TERLARANG[0],
    );
    expect(tanpaKomentar(`const y = { ${KUNCI_TERLARANG[0]}: [] };`)).toContain(KUNCI_TERLARANG[0]);
    expect(POLA_PANGGILAN.test("export { definePrompt } from './definisi.js';")).toBe(false);
    expect(POLA_PANGGILAN.test("const t = definePrompt<A, B>({});")).toBe(true);
  });
});
