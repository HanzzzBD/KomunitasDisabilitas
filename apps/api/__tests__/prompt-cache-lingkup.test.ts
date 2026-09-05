// Penjaga LINGKUP entri cache prompt (PR-044b).
//
// KENAPA ADA. `lingkup: "bersama"` menghapus `userId` dari kunci cache: satu
// entri melayani SEMUA pengguna. Yang disimpan adalah jawaban AI atas masukan —
// jadi menyetel flag itu pada template yang masukannya membawa data pengguna
// adalah kebocoran lintas akun, pada produk yang penggunanya penyandang
// disabilitas. Tidak ada tipe yang bisa membuktikan "masukan ini data publik";
// yang bisa dilakukan mesin hanyalah MEMAKSA keputusan itu ditulis, berikut
// alasannya, di tempat yang terbaca saat review.
//
// Default-nya sudah terbalik ke sisi aman (`PromptSpec.lingkup` absen =
// per-pengguna), persis seperti `tepercaya` di PR-044a. Berkas ini menjaga sisi
// yang tersisa: tidak ada template yang MEMBALIK default itu diam-diam.
//
// DIPASANG SELAGI BERSIH: hari ini daftar di bawah KOSONG, jadi entri pertama
// akan menjadi keputusan yang terlihat, bukan baris yang menyelinap.
//
// PEMINDAIANNYA REKURSIF, DAN ITU BUKAN KEMEWAHAN. Penjaga PR-044a
// (`prompt-sensitif-jangkauan.test.ts`) secara eksplisit MENGIZINKAN
// `definePrompt` dipanggil dari mana pun DI BAWAH `src/core/ai/prompts/` —
// termasuk subfolder. Jadi `prompts/matching/rerank.v1.ts` adalah lokasi yang
// SAH, dan pemindai yang hanya melihat level teratas tidak akan pernah
// melihatnya. PR-072 (re-rank) justru PR yang desainnya memperkirakan ingin
// `lingkup: "bersama"`; memindahkannya ke subfolder — langkah paling wajar
// begitu template lebih dari satu — akan membuat kewajiban allow-list ini diam
// diam berhenti berlaku. "Daftar kosong" dan "tidak memindai apa pun" terlihat
// identik dari luar, jadi turunnya pemindai ke subfolder DIBUKTIKAN sendiri di
// test terpisah di bawah.
import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { spesimenV1 } from "../src/core/ai/index.js";
import { tanpaKomentar } from "./pemindai-kode.js";

const PROMPTS = join(__dirname, "..", "src", "core", "ai", "prompts");

/**
 * Berkas MEKANISME — di sinilah flag itu didefinisikan dan diberi nilai baku.
 * Tanpa literalnya di kedua berkas ini tidak ada flag untuk dijaga sama sekali.
 */
const BERKAS_MEKANISME = ["definisi.ts", "tipe.ts"] as const;

/**
 * Template yang BOLEH memakai `lingkup: "bersama"`, dan kenapa.
 *
 * Syarat satu-satunya: SELURUH masukan template memang data publik (mis. daftar
 * lowongan yang di-rerank) — bukan "sepertinya tidak sensitif", bukan "toh
 * hasilnya umum". Bila ragu, jawabannya adalah tidak menambahkan entri di sini.
 *
 * `file` ditulis RELATIF terhadap folder `prompts/`, selalu dengan pemisah `/`
 * (mis. `"matching/rerank.v1.ts"`) — bukan basename. Basename akan menyamakan
 * dua berkas bernama sama di folder berbeda, dan pemisah `\` akan membuat
 * daftarnya hanya cocok di Windows.
 */
const DIIZINKAN_BERSAMA: ReadonlyArray<{ file: string; alasan: string }> = [];

const bolehBersama = new Set(DIIZINKAN_BERSAMA.map((d) => d.file));

/** `lingkup:` sebagai KODE — `lingkup?: …`, `lingkup: "bersama"`, dst. */
const POLA_LINGKUP = /\blingkup\s*\??\s*:/;

/**
 * Setiap `*.ts` DI BAWAH `dir`, menembus subfolder. Bentuknya sengaja dipinjam
 * apa adanya dari `prompt-sensitif-jangkauan.test.ts` — dua penjaga yang
 * memindai folder yang sama sebaiknya melihat kumpulan berkas yang sama.
 */
function berkasTs(dir: string): string[] {
  const hasil: string[] = [];
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    const penuh = join(dir, entri.name);
    if (entri.isDirectory()) hasil.push(...berkasTs(penuh));
    else if (entri.name.endsWith(".ts")) hasil.push(penuh);
  }
  return hasil;
}

/** Jalur relatif ber-`/`, supaya daftar izin tidak bergantung pada OS. */
function relatif(dir: string, berkas: string): string {
  return relative(dir, berkas).split(sep).join("/");
}

function berkasTemplate(): string[] {
  return berkasTs(PROMPTS).map((f) => relatif(PROMPTS, f));
}

function kode(nama: string): string {
  return tanpaKomentar(readFileSync(join(PROMPTS, ...nama.split("/")), "utf8"));
}

describe("lingkup cache template prompt", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    // Tiga cara penjaga ini bisa hijau tanpa memeriksa apa pun: folder prompt
    // dipindahkan, flagnya diganti nama, atau berkas mekanismenya hilang. Cara
    // KEEMPAT — template bersarang di subfolder — dijaga test berikutnya.
    const berkas = berkasTemplate();
    expect(berkas.filter((f) => /\.v\d+\.ts$/.test(f)).length).toBeGreaterThan(0);
    for (const mekanisme of BERKAS_MEKANISME) {
      expect(berkas).toContain(mekanisme);
      expect(POLA_LINGKUP.test(kode(mekanisme))).toBe(true);
    }
    expect(POLA_LINGKUP.test('const t = { lingkup: "bersama" };')).toBe(true);
    expect(POLA_LINGKUP.test("// lingkup: bersama")).toBe(true);
    expect(tanpaKomentar("// lingkup: bersama")).not.toContain("lingkup");
  });

  it("pemindainya BENAR-BENAR turun ke subfolder", () => {
    // Tanpa test ini, rekursinya sendiri tidak teruji: folder `prompts/` hari
    // ini datar, jadi pemindai yang tidak pernah turun akan tetap hijau. Yang
    // dibangun di sini persis kasus yang ditakutkan — `matching/rerank.v1.ts`
    // ber-`lingkup: "bersama"` — di folder sementara, supaya `prompts/` yang
    // sungguhan tidak perlu dikotori demi membuktikan pemindainya bekerja.
    const akar = mkdtempSync(join(tmpdir(), "lingkup-prompt-"));
    try {
      mkdirSync(join(akar, "matching"));
      writeFileSync(join(akar, "datar.v1.ts"), "export const a = 1;\n", "utf8");
      writeFileSync(
        join(akar, "matching", "rerank.v1.ts"),
        'export const t = { lingkup: "bersama" };\n',
        "utf8",
      );

      const ditemukan = berkasTs(akar)
        .map((f) => relatif(akar, f))
        .sort();
      expect(ditemukan).toEqual(["datar.v1.ts", "matching/rerank.v1.ts"]);
      // Dan jalur relatifnya memang bisa dibaca kembali sebagai berkas — kalau
      // tidak, seluruh `kode()` di bawah membaca berkas yang salah.
      const nested = join(akar, ..."matching/rerank.v1.ts".split("/"));
      expect(POLA_LINGKUP.test(tanpaKomentar(readFileSync(nested, "utf8")))).toBe(true);
    } finally {
      rmSync(akar, { recursive: true, force: true });
    }
  });

  it("tidak ada template yang menyatakan lingkup cache tanpa terdaftar", () => {
    const pelanggar = berkasTemplate()
      .filter((f) => !(BERKAS_MEKANISME as readonly string[]).includes(f))
      .filter((f) => !bolehBersama.has(f))
      .filter((f) => POLA_LINGKUP.test(kode(f)));

    expect(
      pelanggar,
      `Template berikut menyatakan lingkup cache sendiri. ` +
        `\`lingkup: "bersama"\` membuat SATU entri cache dipakai semua pengguna, ` +
        `dan isinya adalah jawaban AI atas masukan — hanya sah bila seluruh ` +
        `masukan template memang data publik. Buang flagnya, atau daftarkan di ` +
        `apps/api/__tests__/prompt-cache-lingkup.test.ts berikut alasannya: ` +
        `${pelanggar.join(", ")}`,
    ).toEqual([]);
  });

  it("setiap alasan benar-benar ditulis, bukan diisi seadanya", () => {
    const pendek = DIIZINKAN_BERSAMA.filter((d) => d.alasan.trim().length < 20);
    expect(pendek.map((d) => d.file)).toEqual([]);
  });

  it("setiap berkas yang diizinkan memang memakai flagnya (izin basi ikut merah)", () => {
    for (const d of DIIZINKAN_BERSAMA) {
      expect(POLA_LINGKUP.test(kode(d.file))).toBe(true);
    }
  });

  it("template yang tidak menulis apa pun jatuh ke sisi aman", () => {
    // Bukti hidup dari default-terbalik itu, bukan sekadar pemindaian teks.
    expect(spesimenV1.lingkup).toBe("pengguna");
  });
});
