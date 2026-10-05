// Token native (PR-089): angka target sentuh dari inti a11y, skala teks, dan
// kontras palet — rasio dihitung, bukan dipercaya dari komentar.
import { ACCESSIBILITY_DEFAULTS, TARGET_SENTUH } from "@nawasena/a11y";

import { tokenNativeDari, type PaletNative } from "../src/token";

function luminans(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontras(a: string, b: string): number {
  const [terang, gelap] = [luminans(a), luminans(b)].sort((x, y) => y - x) as [number, number];
  return (terang + 0.05) / (gelap + 0.05);
}

describe("tokenNativeDari", () => {
  it("bawaan: target 44, skala 1, tanpa kontras tinggi/kurangi gerak", () => {
    const t = tokenNativeDari(ACCESSIBILITY_DEFAULTS);
    expect(t).toMatchObject({
      targetSentuh: TARGET_SENTUH.normal,
      skalaTeks: 1,
      kontrasTinggi: false,
      kurangiGerak: false,
    });
    expect(TARGET_SENTUH.normal).toBe(44);
  });

  it("target besar → 56; skala teks 150% → 1.5; preferensi gerak & kontras diteruskan", () => {
    const t = tokenNativeDari({
      ...ACCESSIBILITY_DEFAULTS,
      largeTouchTargets: true,
      textScale: 150,
      reduceMotion: true,
      highContrast: true,
    });
    expect(t.targetSentuh).toBe(56);
    expect(t.skalaTeks).toBe(1.5);
    expect(t.kurangiGerak).toBe(true);
    expect(t.warna.teks).toBe("#000000");
  });

  it.each([
    ["normal", false],
    ["kontras tinggi", true],
  ])("palet %s memenuhi WCAG AA", (_, highContrast) => {
    const w: PaletNative = tokenNativeDari({ ...ACCESSIBILITY_DEFAULTS, highContrast }).warna;
    // Teks isi ≥ 4,5:1 (1.4.3); batas komponen ≥ 3:1 (1.4.11).
    expect(kontras(w.teks, w.latar)).toBeGreaterThanOrEqual(4.5);
    expect(kontras(w.teksLemah, w.latar)).toBeGreaterThanOrEqual(4.5);
    expect(kontras(w.diAtasUtama, w.utama)).toBeGreaterThanOrEqual(4.5);
    expect(kontras(w.diAtasBahaya, w.bahaya)).toBeGreaterThanOrEqual(4.5);
    expect(kontras(w.bahaya, w.latar)).toBeGreaterThanOrEqual(4.5);
    expect(kontras(w.garis, w.latar)).toBeGreaterThanOrEqual(3);
  });

  it("kontras tinggi lebih kuat daripada normal", () => {
    const normal = tokenNativeDari(ACCESSIBILITY_DEFAULTS).warna;
    const tinggi = tokenNativeDari({ ...ACCESSIBILITY_DEFAULTS, highContrast: true }).warna;
    expect(kontras(tinggi.garis, tinggi.latar)).toBeGreaterThan(
      kontras(normal.garis, normal.latar),
    );
  });
});
