// Kalimat gaji detail lowongan (PR-059) — AC "gaji bila visible". Server
// sudah mengosongkan gaji yang disembunyikan; yang diuji di sini: kalimat
// yang tepat untuk tiap kombinasi, dan TIDAK ADA kalimat bila keduanya kosong.
import { describe, expect, it } from "vitest";
import { kalimatGaji } from "../src/features/job-feed/gaji.js";
import type { FungsiTeks } from "../src/shared/i18n/index.js";

/** `t` palsu: kunci + nilai sisipan, supaya pilihan kunci DAN angkanya terlihat. */
const t = ((kunci: string, nilai?: Record<string, unknown>) =>
  `${kunci} ${JSON.stringify(nilai ?? {})}`) as unknown as FungsiTeks;

describe("kalimatGaji", () => {
  it("min dan max → kalimat rentang dengan format rupiah", () => {
    const kalimat = kalimatGaji(t, 5_000_000, 8_000_000) ?? "";
    expect(kalimat).toMatch(/^lowongan\.detail\.gaji\.rentang /);
    expect(kalimat).toContain("5.000.000");
    expect(kalimat).toContain("8.000.000");
    expect(kalimat).toContain("Rp");
  });

  it("hanya min → 'mulai'", () => {
    expect(kalimatGaji(t, 4_500_000, null)).toMatch(/^lowongan\.detail\.gaji\.mulai .*4\.500\.000/);
  });

  it("hanya max → 'hingga'", () => {
    expect(kalimatGaji(t, null, 7_000_000)).toMatch(
      /^lowongan\.detail\.gaji\.hingga .*7\.000\.000/,
    );
  });

  it("keduanya kosong (disembunyikan server) → null, bukan 'Rp0'", () => {
    expect(kalimatGaji(t, null, null)).toBeNull();
  });
});
