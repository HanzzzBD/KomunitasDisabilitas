// Tren tekstual tile metrik (PR-081, Testing Checklist "Unit Test (tile)").
import { describe, expect, it } from "vitest";
import { hitungTren, kalimatTren } from "../src/features/admin/metrik-tren.js";
import { katalog } from "../src/shared/i18n/katalog/semua.js";
import { terjemah } from "../src/shared/i18n/terjemah.js";
import type { FungsiTeks } from "../src/shared/i18n/index.js";

const t = ((kunci: string, params?: Record<string, string | number>) =>
  terjemah(katalog, "id", kunci, params).teks) as FungsiTeks;

describe("hitungTren", () => {
  it.each([
    [15, 12, { arah: "naik", selisih: 3 }],
    [9, 12, { arah: "turun", selisih: 3 }],
    [4, 4, { arah: "sama", selisih: 0 }],
  ] as const)("%i vs %i", (kini, lalu, harap) => {
    expect(hitungTren(kini, lalu)).toEqual(harap);
  });
});

describe("kalimatTren — arah, selisih, DAN pembandingnya disebut", () => {
  it("naik / turun / sama", () => {
    expect(kalimatTren(t, "30d", 15, 12)).toBe("Naik 3 dibanding 30 hari sebelumnya (12)");
    expect(kalimatTren(t, "7d", 1, 1_250)).toBe("Turun 1.249 dibanding 7 hari sebelumnya (1.250)");
    expect(kalimatTren(t, "30d", 4, 4)).toBe("Sama dengan 30 hari sebelumnya (4)");
  });

  it("'semua' atau tanpa pembanding → tidak ada kalimat tren", () => {
    expect(kalimatTren(t, "semua", 5, 3)).toBeNull();
    expect(kalimatTren(t, "30d", 5, undefined)).toBeNull();
  });
});
