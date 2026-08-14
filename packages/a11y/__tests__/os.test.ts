// Membaca setelan aksesibilitas OS — AC PR-026 nomor 1.
import { describe, expect, it, vi } from "vitest";
import { KUERI_OS, bacaSinyalOS, pantauSinyalOS, type JendelaMedia } from "../src/web/os.js";

interface MqlPalsu {
  media: string;
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  pemicu: (() => void)[];
}

/**
 * `dikenali: false` meniru browser lama yang tidak mengenal kueri itu — ia
 * menormalkan `media` menjadi "not all", persis perilaku yang dipakai
 * `bacaSinyalOS` untuk membedakan "tidak tahu" dari "tahu, jawabannya tidak".
 */
function jendelaPalsu(
  jawaban: Partial<Record<string, { matches: boolean; dikenali?: boolean }>>,
): JendelaMedia & { mql: Map<string, MqlPalsu> } {
  const mql = new Map<string, MqlPalsu>();

  return {
    mql,
    matchMedia(kueri: string) {
      const j = jawaban[kueri] ?? { matches: false, dikenali: true };
      const dikenali = j.dikenali ?? true;
      const ada = mql.get(kueri);
      if (ada !== undefined) return ada as unknown as MediaQueryList;

      const pemicu: (() => void)[] = [];
      const objek: MqlPalsu = {
        media: dikenali ? kueri : "not all",
        matches: dikenali && j.matches,
        addEventListener: vi.fn((_n: string, cb: () => void) => pemicu.push(cb)),
        removeEventListener: vi.fn((_n: string, cb: () => void) => {
          const i = pemicu.indexOf(cb);
          if (i >= 0) pemicu.splice(i, 1);
        }),
        pemicu,
      };
      mql.set(kueri, objek);
      return objek as unknown as MediaQueryList;
    },
  };
}

describe("bacaSinyalOS", () => {
  it("melaporkan setelan yang aktif", () => {
    const j = jendelaPalsu({ [KUERI_OS.reduceMotion]: { matches: true } });
    expect(bacaSinyalOS(j).reduceMotion).toBe(true);
  });

  it("melaporkan `false` bila OS tahu dan jawabannya tidak", () => {
    const j = jendelaPalsu({ [KUERI_OS.reduceMotion]: { matches: false } });
    expect(bacaSinyalOS(j).reduceMotion).toBe(false);
  });

  it("melaporkan `undefined` bila browser TIDAK MENGENAL kueri", () => {
    // Ini pembedaan yang menentukan. Browser lama tidak mengenal
    // `prefers-contrast`; melaporkan `false` di sana berarti memberi tahu
    // rekonsiliasi bahwa "pengguna tidak mau kontras tinggi" — jawaban yang
    // tidak pernah diberikan siapa pun.
    const j = jendelaPalsu({ [KUERI_OS.highContrast]: { matches: false, dikenali: false } });
    expect(bacaSinyalOS(j).highContrast).toBeUndefined();
  });

  it("memakai `prefers-contrast: more`, bukan `high`", () => {
    // `high` nilai lama yang tidak pernah masuk standar.
    expect(KUERI_OS.highContrast).toBe("(prefers-contrast: more)");
  });
});

describe("pantauSinyalOS", () => {
  it("melaporkan ulang saat setelan OS berubah di tengah sesi", () => {
    // Mengaktifkan "kurangi gerak" di tengah sesi karena mulai pusing adalah
    // persis momen ketika setelan itu paling dibutuhkan. Membaca sekali saat
    // boot tidak cukup.
    const j = jendelaPalsu({ [KUERI_OS.reduceMotion]: { matches: false } });
    const saatBerubah = vi.fn();
    pantauSinyalOS(j, saatBerubah);

    const mql = j.mql.get(KUERI_OS.reduceMotion)!;
    mql.matches = true;
    mql.pemicu.forEach((cb) => cb());

    expect(saatBerubah).toHaveBeenCalledWith(expect.objectContaining({ reduceMotion: true }));
  });

  it("pembatalan melepas SEMUA listener", () => {
    const j = jendelaPalsu({});
    const batal = pantauSinyalOS(j, vi.fn());
    batal();

    for (const kueri of Object.values(KUERI_OS)) {
      expect(j.mql.get(kueri)?.removeEventListener).toHaveBeenCalledTimes(1);
    }
  });

  it("memantau setiap kueri yang dikenal", () => {
    const j = jendelaPalsu({});
    pantauSinyalOS(j, vi.fn());
    expect(j.mql.size).toBe(Object.keys(KUERI_OS).length);
  });
});
