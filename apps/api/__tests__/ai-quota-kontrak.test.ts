// Penjaga kesepadanan kontrak `/ai/quota` (PR-043a) — dua sumber, satu bentuk.
//
// `AiQuotaRingkasan` (core/ai/quota.ts) adalah yang DIKEMBALIKAN server;
// `aiQuotaSummarySchema` (@nawasena/schemas) adalah yang DIJANJIKAN dokumen
// OpenAPI kepada klien. Keduanya memang sengaja terpisah: jalur boot fail-fast
// di `src/index.ts` mengambil konfigurasi kuota lewat jalur sempit
// `core/ai/quota-config.js` dan tidak boleh menyeret paket schemas.
//
// Harga dari pemisahan itu adalah kemungkinan MELENCENG DIAM-DIAM: menambah
// field di ringkasan server tanpa menambahnya di skema membuat dokumen berbohong,
// dan tidak ada yang merah. Berkas ini yang membuatnya merah — di typecheck,
// bukan saat klien mobile menemukannya.
import { describe, it, expect, expectTypeOf } from "vitest";
import { aiQuotaFeatureSchema, aiQuotaSummarySchema, type AiQuotaSummary } from "@nawasena/schemas";
import { AI_FEATURES } from "../src/core/ai/quota-config.js";
import type { AiQuotaRingkasan } from "../src/core/ai/quota.js";

describe("kontrak /ai/quota — schemas vs core/ai", () => {
  it("bentuk ringkasan server dan skema klien saling menerima", () => {
    // Dua arah dengan sengaja. Satu arah saja masih meloloskan skema yang
    // LEBIH LONGGAR daripada jawaban server (atau sebaliknya), dan justru
    // selisih arah itulah yang membuat klien pecah di lapangan.
    expectTypeOf<AiQuotaRingkasan>().toMatchTypeOf<AiQuotaSummary>();
    expectTypeOf<AiQuotaSummary>().toMatchTypeOf<AiQuotaRingkasan>();
  });

  it("daftar fitur berkuota identik, termasuk urutannya", () => {
    // Urutan ikut dijaga: `AI_FEATURES` menentukan urutan `fitur[]` di jawaban,
    // dan dokumen yang menyebut urutan lain menyesatkan pembacanya.
    expect(aiQuotaFeatureSchema.options).toEqual([...AI_FEATURES]);
  });

  it("skema menerima jawaban yang benar-benar dibentuk server", () => {
    const jawaban: AiQuotaRingkasan = {
      hari: "2026-09-05",
      resetDalamDetik: 3600,
      fitur: AI_FEATURES.map((fitur) => ({ fitur, batas: 10, terpakai: 3, sisa: 7 })),
      globalTersedia: true,
    };

    expect(aiQuotaSummarySchema.parse(jawaban)).toEqual(jawaban);
  });

  it("menolak bentuk yang salah, bukan sekadar menerima yang benar", () => {
    // Tanpa kasus ini, skema yang seluruh field-nya `z.any()` akan lulus tiga
    // test di atas.
    expect(() => aiQuotaSummarySchema.parse({})).toThrow();
    expect(() =>
      aiQuotaSummarySchema.parse({
        hari: "5 September 2026", // bukan YYYY-MM-DD
        resetDalamDetik: 3600,
        fitur: [],
        globalTersedia: true,
      }),
    ).toThrow();
    expect(() =>
      aiQuotaSummarySchema.parse({
        hari: "2026-09-05",
        resetDalamDetik: 3600,
        fitur: [{ fitur: "fitur_karangan", batas: 1, terpakai: 0, sisa: 1 }],
        globalTersedia: true,
      }),
    ).toThrow();
  });
});
