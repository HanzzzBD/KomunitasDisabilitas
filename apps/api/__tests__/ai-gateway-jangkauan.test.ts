// Penjaga jangkauan pabrik provider AI (utang U-07, dibayar PR-066).
//
// KENAPA ADA. `AiClient` adalah satu-satunya jalan yang mengikat kuota, jejak
// biaya (`ai_usage`), dan cache ke panggilan LLM. Tetapi barrel `core/ai` juga
// mengekspor pabrik di BAWAHNYA — `createAiGateway`, `createAiStreamGateway`, dan
// adapter stream — karena composition root membutuhkannya. Sebuah modul yang
// memanggilnya langsung mendapat provider mentah: tanpa kuota, tanpa jejak biaya,
// tanpa cache. Tidak ada tipe yang menolaknya dan tidak ada test fitur yang
// merah; yang terlihat hanya tagihan.
//
// `boundaries.test.ts` sudah melarang impor TIGA SDK AI (AC-5 PR-041). Penjaga
// ini adalah lapis berikutnya: melarang PEMANGGILAN pabrik di luar tempat yang
// memang merakitnya.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { tanpaKomentar } from "./pemindai-kode.js";

const SRC = join(__dirname, "..", "src");
const WORKER_SRC = join(__dirname, "..", "..", "worker", "src");

/** Pabrik yang menghasilkan provider TANPA kuota/jejak biaya. */
const PABRIK = [
  "createAiGateway",
  "createAiStreamGateway",
  "createAiRouter",
  "createAiStreamRouter",
  "createGeminiProvider",
  "createGroqProvider",
  "createGeminiStream",
  "createGroqStream",
] as const;

/** Sintaks PANGGILAN (`nama(`), bukan sekadar nama — re-ekspor barrel bukan pemanggil. */
const POLA = new RegExp(`\\b(${PABRIK.join("|")})\\s*\\(`);

/**
 * Tempat yang BOLEH memanggil, dan kenapa. HANYA `core/ai`: di sanalah pabrik
 * itu saling menyusun, termasuk `rakit.ts` yang dipakai kedua composition root
 * (`boot.ts` dan worker) sejak PR-067 — penjaga ini justru MENGETAT.
 */
const DIIZINKAN: ReadonlyArray<{ awalan: string; alasan: string }> = [
  { awalan: join("core", "ai") + sep, alasan: "tempat pabrik didefinisikan dan saling menyusun" },
];

function berkasTs(dir: string): string[] {
  const hasil: string[] = [];
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    const penuh = join(dir, entri.name);
    if (entri.isDirectory()) hasil.push(...berkasTs(penuh));
    else if (entri.name.endsWith(".ts")) hasil.push(penuh);
  }
  return hasil;
}

const pemanggil = (dir: string): string[] =>
  berkasTs(dir).filter((f) => POLA.test(tanpaKomentar(readFileSync(f, "utf8"))));

describe("jangkauan pabrik provider AI (U-07)", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    // Sejak PR-067 satu-satunya pemanggil sah adalah perakit bersama
    // `core/ai/rakit.ts`. Bila pola tidak lagi cocok (nama pabrik berubah),
    // ia hilang dari daftar, dan test ini yang merah duluan.
    expect(pemanggil(SRC).map((f) => relative(SRC, f))).toContain(join("core", "ai", "rakit.ts"));
  });

  it("apa pun di luar core/ai — termasuk boot.ts — tidak memanggil pabrik provider", () => {
    const liar = pemanggil(SRC)
      .map((f) => relative(SRC, f))
      .filter((f) => !DIIZINKAN.some((d) => f === d.awalan || f.startsWith(d.awalan)));

    expect(
      liar,
      "Berkas berikut memanggil pabrik provider AI langsung — melewati kuota, jejak biaya, " +
        "dan cache. Pakai `rakitAiClient` (core/ai/rakit.ts) di composition root: " +
        liar.join(", "),
    ).toEqual([]);
  });

  it("apps/worker juga tidak memanggilnya — ia merakit lewat `rakitAiClient` (PR-067)", () => {
    expect(pemanggil(WORKER_SRC).map((f) => relative(WORKER_SRC, f))).toEqual([]);
  });
});
