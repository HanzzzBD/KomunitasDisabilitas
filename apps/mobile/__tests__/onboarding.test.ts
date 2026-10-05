// Koordinator sesi ↔ preferensi akun ↔ onboarding (PR-091) + mesin langkah.
import {
  createA11yStore,
  rekonsiliasi,
  type AccessibilityProfile,
  type PenyimpananA11y,
} from "@nawasena/a11y";
import { ACCESSIBILITY_PROFILE_KOSONG } from "@nawasena/schemas";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { StatusSesi } from "../src/auth/sesi";
import {
  createKoordinatorOnboarding,
  kunciPenanda,
  putuskanOnboarding,
  subDariToken,
  type PenyimpananPenanda,
} from "../src/onboarding/koordinator";
import {
  geserSkala,
  LANGKAH,
  langkahSaatIni,
  reduksiWizard,
  STATE_AWAL,
} from "../src/onboarding/mesin-langkah";

const USER = "01912345-89ab-7def-8123-000000000001";
/** JWT tanpa tanda tangan sah — koordinator hanya membaca `sub`. */
const tokenUntuk = (sub: string) =>
  `h.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.ttd`;

function memori(): PenyimpananA11y & PenyimpananPenanda & { isi: Map<string, string> } {
  const isi = new Map<string, string>();
  return {
    isi,
    getItem: async (k) => isi.get(k) ?? null,
    setItem: async (k, v) => void isi.set(k, v),
    removeItem: async (k) => void isi.delete(k),
  };
}

const tunggu = () => new Promise((r) => setTimeout(r, 0));

function rakit(opsi: { profil?: AccessibilityProfile | Error; wizardAktif?: boolean } = {}) {
  const sesi = createStore<{ status: StatusSesi; accessToken: string | null }>()(() => ({
    status: "memulihkan",
    accessToken: null,
  }));
  const simpanan = memori();
  const a11y = createA11yStore({ storage: simpanan, nama: `uji-${Math.random()}` });
  let jawabProfil: (() => void) | null = null;
  const ambilProfil = vi.fn(
    () =>
      new Promise<AccessibilityProfile>((resolve, reject) => {
        jawabProfil = () => {
          const p = opsi.profil ?? ACCESSIBILITY_PROFILE_KOSONG;
          if (p instanceof Error) reject(p);
          else resolve(p);
        };
      }),
  );
  const k = createKoordinatorOnboarding({
    sesi,
    a11y,
    ambilProfil,
    penanda: simpanan,
    wizardAktif: opsi.wizardAktif ?? true,
  });
  const masuk = async () => {
    sesi.setState({ status: "masuk", accessToken: tokenUntuk(USER) });
    await tunggu();
    jawabProfil?.();
    await tunggu();
    await tunggu();
  };
  return { sesi, a11y, simpanan, k, ambilProfil, masuk, jawab: () => jawabProfil?.() };
}

describe("subDariToken", () => {
  it("membaca klaim sub; token rusak → null", () => {
    expect(subDariToken(tokenUntuk(USER))).toBe(USER);
    expect(subDariToken("bukan.jwt")).toBeNull();
    expect(subDariToken("a.%%%.c")).toBeNull();
    expect(subDariToken(null)).toBeNull();
  });
});

describe("putuskanOnboarding", () => {
  const kosong = ACCESSIBILITY_PROFILE_KOSONG;
  it.each([
    [{ wizardAktif: false, sudahDitandai: false, profil: kosong }, "selesai", false],
    [{ wizardAktif: true, sudahDitandai: true, profil: kosong }, "selesai", false],
    [{ wizardAktif: true, sudahDitandai: false, profil: null }, "selesai", false],
    [{ wizardAktif: true, sudahDitandai: false, profil: kosong }, "perlu", false],
    [
      { wizardAktif: true, sudahDitandai: false, profil: { ...kosong, highContrast: true } },
      "selesai",
      true,
    ],
  ] as const)("%o → %s (tandai=%s)", (input, status, tandai) => {
    expect(putuskanOnboarding(input)).toEqual({ status, tandai });
  });
});

describe("koordinator — masuk", () => {
  it("akun baru (profil kosong) → wizard tampil", async () => {
    const { k, masuk } = rakit();
    expect(k.store.getState().status).toBe("menunggu");
    await masuk();
    expect(k.store.getState().status).toBe("perlu");
  });

  it("preferensi dari web tercermin di mobile pasca-login; wizard dilewati dan ditandai", async () => {
    const { k, a11y, simpanan, masuk } = rakit({
      profil: { ...ACCESSIBILITY_PROFILE_KOSONG, highContrast: true, textScale: 150 },
    });
    await masuk();

    expect(a11y.getState().pilihanPengguna).toEqual({ highContrast: true, textScale: 150 });
    expect(k.store.getState().status).toBe("selesai");
    expect(simpanan.isi.get(kunciPenanda(USER))).toBe("1");
  });

  it("null di akun tidak ditulis → setelan Android tetap berlaku (eksplisit > OS)", async () => {
    const { a11y, masuk } = rakit({
      profil: { ...ACCESSIBILITY_PROFILE_KOSONG, highContrast: false },
    });
    a11y.getState().setSinyalOS({ reduceMotion: true, highContrast: true });
    await masuk();

    const efektif = rekonsiliasi(a11y.getState().pilihanPengguna, a11y.getState().os);
    expect(efektif.reduceMotion).toBe(true); // dari OS — akun belum memilih
    expect(efektif.highContrast).toBe(false); // pilihan eksplisit menang atas OS
  });

  it("perubahan pengguna selama GET berjalan tidak ditimpa nilai akun", async () => {
    const { sesi, a11y, jawab } = rakit({
      profil: { ...ACCESSIBILITY_PROFILE_KOSONG, textScale: 125, reduceMotion: true },
    });
    sesi.setState({ status: "masuk", accessToken: tokenUntuk(USER) });
    await tunggu();
    a11y.getState().setPreferensi({ textScale: 200 });
    jawab();
    await tunggu();
    await tunggu();

    expect(a11y.getState().pilihanPengguna).toEqual({ textScale: 200, reduceMotion: true });
  });

  it("perangkat sudah ditandai → tidak ditanya lagi walau akun kosong", async () => {
    const { k, simpanan, masuk } = rakit();
    simpanan.isi.set(kunciPenanda(USER), "1");
    await masuk();
    expect(k.store.getState().status).toBe("selesai");
  });

  it("profil gagal diambil → tidak menahan pengguna, tidak ditandai", async () => {
    const { k, simpanan, masuk } = rakit({ profil: new Error("jaringan") });
    await masuk();
    expect(k.store.getState().status).toBe("selesai");
    expect(simpanan.isi.has(kunciPenanda(USER))).toBe(false);
  });

  it("sakelar rollback mati → tidak pernah wizard", async () => {
    const { k, masuk } = rakit({ wizardAktif: false });
    await masuk();
    expect(k.store.getState().status).toBe("selesai");
  });

  it("selesaikan() menandai perangkat untuk akun ini", async () => {
    const { k, simpanan, masuk } = rakit();
    await masuk();
    await k.store.getState().selesaikan();
    expect(k.store.getState().status).toBe("selesai");
    expect(simpanan.isi.get(kunciPenanda(USER))).toBe("1");
  });
});

describe("koordinator — keluar", () => {
  it("masuk → keluar: preferensi pengguna dihapus dari perangkat (perangkat bersama)", async () => {
    const { sesi, a11y, masuk } = rakit({
      profil: { ...ACCESSIBILITY_PROFILE_KOSONG, highContrast: true },
    });
    await masuk();
    sesi.setState({ status: "keluar", accessToken: null });

    expect(a11y.getState().pilihanPengguna).toEqual({});
  });

  it("boot tanpa sesi (memulihkan → keluar) TIDAK menghapus preferensi", () => {
    const { sesi, a11y } = rakit();
    a11y.getState().setPreferensi({ textScale: 175 });
    sesi.setState({ status: "keluar" });

    expect(a11y.getState().pilihanPengguna).toEqual({ textScale: 175 });
  });

  it("jawaban GET milik sesi yang sudah keluar dibuang", async () => {
    const { sesi, a11y, k, jawab } = rakit({
      profil: { ...ACCESSIBILITY_PROFILE_KOSONG, highContrast: true },
    });
    sesi.setState({ status: "masuk", accessToken: tokenUntuk(USER) });
    await tunggu();
    sesi.setState({ status: "keluar", accessToken: null });
    jawab();
    await tunggu();

    expect(a11y.getState().pilihanPengguna).toEqual({});
    expect(k.store.getState().status).toBe("menunggu");
  });
});

describe("mesin langkah", () => {
  it("empat langkah paritas web; batas awal dan akhir ditegakkan reducer", () => {
    expect(LANGKAH).toEqual(["ragam", "persetujuan", "preferensi", "ringkasan"]);
    expect(reduksiWizard(STATE_AWAL, { type: "MUNDUR" })).toBe(STATE_AWAL);

    let s = STATE_AWAL;
    for (let i = 0; i < 10; i++) s = reduksiWizard(s, { type: "MAJU" });
    expect(langkahSaatIni(s)).toBe("ringkasan");
    expect(langkahSaatIni(reduksiWizard(s, { type: "MUNDUR" }))).toBe("preferensi");
  });

  it("skala teks bergeser 25 dalam rentang 100–200", () => {
    expect(geserSkala(100, 1)).toBe(125);
    expect(geserSkala(200, 1)).toBe(200);
    expect(geserSkala(100, -1)).toBe(100);
  });
});
