// Penjaga sinkronisasi `.env.example` (audit dokumen 2026-08-07).
//
// KENAPA ADA. `INTERNAL_TOKEN` hidup di skema env selama beberapa PR tanpa
// pernah muncul di template. Akibatnya bukan sepele: tanpa variabel itu SELURUH
// `/internal/*` menolak (deny-by-default), jadi operator yang menyiapkan
// monitoring tidak punya satu pun petunjuk bahwa knob-nya ada — endpointnya
// hanya diam-diam 401.
//
// Pola yang ditiru: `check:openapi`. Dokumen yang punya penjaga otomatis di
// repo ini tidak pernah melenceng; yang tidak punya, melenceng semua.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENV_KEYS } from "../src/core/config/env.js";

const contoh = readFileSync(resolve(__dirname, "../.env.example"), "utf8");

/**
 * Variabel dianggap terdokumentasi bila muncul sebagai `NAMA=` — dengan atau
 * tanpa `#` di depannya. Yang opsional memang sengaja dikomentari supaya
 * `cp .env.example .env` menghasilkan konfigurasi dev yang jalan tanpa
 * kredensial pihak ketiga.
 */
function terdokumentasi(nama: string): boolean {
  return new RegExp(`^\\s*#?\\s*${nama}=`, "m").test(contoh);
}

describe("apps/api/.env.example — sinkron dengan skema env", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    // Bila ENV_KEYS kosong (mis. bentuk skema berubah), kedua test di bawah
    // akan hijau tanpa memeriksa apa pun. Yang menjaga penjaganya adalah ini.
    expect(ENV_KEYS.length).toBeGreaterThan(10);
    expect(ENV_KEYS).toContain("DATABASE_URL");
  });

  it("setiap variabel yang dikenali API muncul di template", () => {
    const hilang = ENV_KEYS.filter((nama) => !terdokumentasi(nama));
    expect(hilang, `Variabel berikut belum ada di apps/api/.env.example: ${hilang.join(", ")}`).toEqual(
      [],
    );
  });

  it("template tidak memuat variabel yang sudah tidak dikenali API", () => {
    // Menangkap arah sebaliknya: variabel yang dihapus dari skema tetapi masih
    // dianjurkan template, sehingga operator menyetel sesuatu yang diabaikan.
    const dikenal = new Set([
      ...ENV_KEYS,
      // Dibaca gerbang fail-fast di index.ts, bukan oleh skema zod (kunci
      // enkripsi field, ADR-007). Rotasi menambah FIELD_KEY_V2, V3, dst.
      "FIELD_KEY_V1",
    ]);
    const asing = [...contoh.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/gm)]
      .map((m) => m[1] as string)
      // Override antrean bersifat pola (QUEUE_<NAMA>_<FIELD>), bukan daftar tetap.
      .filter((nama) => !nama.startsWith("QUEUE_") && !nama.startsWith("FIELD_KEY_V"))
      // Jatah kuota AI juga pola (AI_QUOTA_<FITUR>_PER_DAY, PR-043): dibaca
      // core/ai/quota-config.ts, bukan skema zod env — sama seperti QUEUE_*.
      // Sengaja SEMPIT (harus berakhiran _PER_DAY): AI_QUOTA_FAIL_OPEN adalah
      // variabel skema biasa dan tetap wajib dikenali di kedua arah.
      .filter((nama) => !/^AI_QUOTA_[A-Z0-9_]+_PER_DAY$/.test(nama))
      .filter((nama) => !dikenal.has(nama));

    expect([...new Set(asing)]).toEqual([]);
  });
});
