// Session store mobile (PR-090): boot memulihkan sesi dari SecureStore, masuk
// menyimpan refresh token, keluar membersihkan walau jaringan gagal.
import { describe, expect, it, vi } from "vitest";

import { createSesiStore, type DepsSesi, type HasilPerpanjang } from "../src/auth/sesi";
import type { TokenStorage } from "../src/storage/token-storage";

function penyimpananPalsu(awal: string | null = null): TokenStorage & { nilai: string | null } {
  const p = {
    nilai: awal,
    getRefreshToken: vi.fn(async () => p.nilai),
    setRefreshToken: vi.fn(async (t: string) => {
      p.nilai = t;
    }),
    clearRefreshToken: vi.fn(async () => {
      p.nilai = null;
    }),
  };
  return p;
}

function buat(opsi: { tersimpan?: string | null; perpanjang?: HasilPerpanjang } = {}) {
  const penyimpanan = penyimpananPalsu(opsi.tersimpan ?? null);
  const deps: DepsSesi = {
    penyimpanan,
    perpanjang: vi.fn(
      async (): Promise<HasilPerpanjang> =>
        opsi.perpanjang ?? { ok: true, accessToken: "at-baru", refreshToken: "rt-baru" },
    ),
    keluarDiServer: vi.fn(async () => undefined),
  };
  return { store: createSesiStore(deps), penyimpanan, deps };
}

describe("pulihkan (boot)", () => {
  it("mulai dari status memulihkan", () => {
    expect(buat().store.getState().status).toBe("memulihkan");
  });

  it("tanpa refresh token tersimpan → keluar, tanpa memanggil server", async () => {
    const { store, deps } = buat();
    await store.getState().pulihkan();

    expect(store.getState()).toMatchObject({ status: "keluar", accessToken: null });
    expect(deps.perpanjang).not.toHaveBeenCalled();
  });

  it("refresh sah → masuk; token hasil rotasi disimpan (sesi bertahan restart)", async () => {
    const { store, penyimpanan, deps } = buat({ tersimpan: "rt-lama" });
    await store.getState().pulihkan();

    expect(deps.perpanjang).toHaveBeenCalledWith("rt-lama");
    expect(store.getState()).toMatchObject({ status: "masuk", accessToken: "at-baru" });
    expect(penyimpanan.nilai).toBe("rt-baru");
  });

  it("refresh ditolak server → token dibuang, keluar", async () => {
    const { store, penyimpanan } = buat({
      tersimpan: "rt-mati",
      perpanjang: { ok: false, sebab: "ditolak" },
    });
    await store.getState().pulihkan();

    expect(store.getState().status).toBe("keluar");
    expect(penyimpanan.nilai).toBeNull();
  });

  it("server tak terjangkau → terputus, token TIDAK dibuang", async () => {
    const { store, penyimpanan } = buat({
      tersimpan: "rt-sah",
      perpanjang: { ok: false, sebab: "jaringan" },
    });
    await store.getState().pulihkan();

    expect(store.getState().status).toBe("terputus");
    expect(penyimpanan.nilai).toBe("rt-sah");
  });
});

describe("masuk", () => {
  it("menyimpan refresh token ke penyimpanan, access token hanya di memori", async () => {
    const { store, penyimpanan } = buat();
    await store.getState().masuk({ accessToken: "at", expiresIn: 900, refreshToken: "rt" });

    expect(penyimpanan.nilai).toBe("rt");
    expect(store.getState()).toMatchObject({ status: "masuk", accessToken: "at" });
    // Refresh token tidak pernah ikut state (state bisa dibaca devtools/log).
    expect(JSON.stringify(store.getState())).not.toContain('"rt"');
  });

  it("respons tanpa refresh token (bentuk web) → gagal keras, tetap keluar", async () => {
    const { store } = buat();
    await store.getState().pulihkan();

    await expect(store.getState().masuk({ accessToken: "at", expiresIn: 900 })).rejects.toThrow(
      /client: 'mobile'/,
    );
    expect(store.getState().status).toBe("keluar");
  });
});

describe("keluar & sesi berakhir", () => {
  it("keluar: lokal dibersihkan dan server diberi tahu dengan refresh token", async () => {
    const { store, penyimpanan, deps } = buat();
    await store.getState().masuk({ accessToken: "at", expiresIn: 900, refreshToken: "rt" });
    await store.getState().keluar();

    expect(deps.keluarDiServer).toHaveBeenCalledWith("rt");
    expect(penyimpanan.nilai).toBeNull();
    expect(store.getState()).toMatchObject({ status: "keluar", accessToken: null });
  });

  it("keluar tetap berhasil walau server gagal dihubungi", async () => {
    const { store, deps, penyimpanan } = buat();
    vi.mocked(deps.keluarDiServer).mockRejectedValueOnce(new Error("jaringan"));
    await store.getState().masuk({ accessToken: "at", expiresIn: 900, refreshToken: "rt" });

    await expect(store.getState().keluar()).resolves.toBeUndefined();
    expect(penyimpanan.nilai).toBeNull();
  });

  it("sesiBerakhir (refresh ditolak di tengah sesi) → keluar dan token dibuang", async () => {
    const { store, penyimpanan } = buat();
    await store.getState().masuk({ accessToken: "at", expiresIn: 900, refreshToken: "rt" });
    await store.getState().sesiBerakhir();

    expect(store.getState().status).toBe("keluar");
    expect(penyimpanan.nilai).toBeNull();
  });

  it("gantiAccessToken hanya mengganti access token", async () => {
    const { store } = buat();
    await store.getState().masuk({ accessToken: "at", expiresIn: 900, refreshToken: "rt" });
    store.getState().gantiAccessToken("at-2");

    expect(store.getState()).toMatchObject({ status: "masuk", accessToken: "at-2" });
  });
});
