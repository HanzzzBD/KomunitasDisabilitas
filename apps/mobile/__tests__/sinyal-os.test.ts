// Pemetaan setelan aksesibilitas Android → SinyalOS (PR-091).
import { describe, expect, it, vi } from "vitest";

import { pantauSinyalOS, type SumberSinyalOS } from "../src/a11y/sinyal-os";

type Cb = (aktif: boolean) => void;

function sumberPalsu(awal: { gerak?: boolean | Error; kontras?: boolean | Error } = {}) {
  const pendengar = new Map<string, Cb>();
  const hapus = vi.fn();
  const jawab = (v: boolean | Error | undefined) =>
    v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? false);
  const sumber: SumberSinyalOS = {
    isReduceMotionEnabled: () => jawab(awal.gerak),
    isHighTextContrastEnabled: () => jawab(awal.kontras),
    addEventListener: (nama, cb) => {
      pendengar.set(nama, cb);
      return { remove: hapus };
    },
  };
  return { sumber, pancar: (nama: string, v: boolean) => pendengar.get(nama)?.(v), hapus };
}

const tunggu = () => new Promise((r) => setTimeout(r, 0));

describe("pantauSinyalOS", () => {
  it("membaca 'Hapus animasi' dan 'Teks kontras tinggi' saat mulai", async () => {
    const { sumber } = sumberPalsu({ gerak: true, kontras: false });
    const set = vi.fn();
    pantauSinyalOS(sumber, set);
    await tunggu();

    expect(set).toHaveBeenLastCalledWith({ reduceMotion: true, highContrast: false });
  });

  it("perubahan setelan saat app terbuka langsung diteruskan (tanpa restart)", async () => {
    const { sumber, pancar } = sumberPalsu();
    const set = vi.fn();
    pantauSinyalOS(sumber, set);
    await tunggu();

    pancar("highTextContrastChanged", true);
    expect(set).toHaveBeenLastCalledWith({ reduceMotion: false, highContrast: true });
  });

  it("gagal membaca = tidak diketahui (undefined), bukan false", async () => {
    const { sumber } = sumberPalsu({ gerak: new Error("tak didukung"), kontras: true });
    const set = vi.fn();
    pantauSinyalOS(sumber, set);
    await tunggu();

    expect(set).toHaveBeenLastCalledWith({ reduceMotion: undefined, highContrast: true });
  });

  it("event yang tiba sebelum bacaan awal tidak ditimpa nilai lama", async () => {
    const { sumber, pancar } = sumberPalsu({ gerak: false });
    const set = vi.fn();
    pantauSinyalOS(sumber, set);
    pancar("reduceMotionChanged", true);
    await tunggu();

    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ reduceMotion: true }));
  });

  it("pelepas: langganan dicabut dan tidak ada pembaruan lagi", async () => {
    const { sumber, pancar, hapus } = sumberPalsu();
    const set = vi.fn();
    const lepas = pantauSinyalOS(sumber, set);
    await tunggu();
    lepas();
    set.mockClear();

    pancar("reduceMotionChanged", true);
    expect(hapus).toHaveBeenCalledTimes(2);
    expect(set).not.toHaveBeenCalled();
  });
});
