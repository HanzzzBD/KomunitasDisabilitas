// Wrapper refresh token di atas SecureStore (PR-088). Adaptornya palsu, tapi
// perilaku yang diuji adalah milik wrapper: roundtrip, penolakan nilai yang
// tidak masuk akal sebagai token, dan pemulihan saat Keystore tidak terbaca.
import { describe, expect, it, vi } from "vitest";

import {
  BATAS_PANJANG_TOKEN,
  createTokenStorage,
  REFRESH_TOKEN_KEY,
  type SecureStoreAdapter,
} from "../src/storage/token-storage";

function storePalsu(): SecureStoreAdapter & { isi: Map<string, string> } {
  const isi = new Map<string, string>();
  return {
    isi,
    getItemAsync: vi.fn(async (k: string) => isi.get(k) ?? null),
    setItemAsync: vi.fn(async (k: string, v: string) => void isi.set(k, v)),
    deleteItemAsync: vi.fn(async (k: string) => void isi.delete(k)),
  };
}

describe("createTokenStorage", () => {
  it("roundtrip: simpan → baca → hapus", async () => {
    const store = storePalsu();
    const storage = createTokenStorage(store);

    expect(await storage.getRefreshToken()).toBeNull();
    await storage.setRefreshToken("rt_abc.123");
    expect(await storage.getRefreshToken()).toBe("rt_abc.123");
    await storage.clearRefreshToken();
    expect(await storage.getRefreshToken()).toBeNull();
  });

  it("memakai satu kunci yang sah untuk SecureStore", async () => {
    const store = storePalsu();
    await createTokenStorage(store).setRefreshToken("rt");

    expect([...store.isi.keys()]).toEqual([REFRESH_TOKEN_KEY]);
    expect(REFRESH_TOKEN_KEY).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it.each([
    ["kosong", ""],
    ["spasi di tepi", " rt "],
    ["terlalu panjang", "x".repeat(BATAS_PANJANG_TOKEN + 1)],
  ])("menolak token %s tanpa menyentuh store", async (_, token) => {
    const store = storePalsu();
    await expect(createTokenStorage(store).setRefreshToken(token)).rejects.toThrow();
    expect(store.setItemAsync).not.toHaveBeenCalled();
  });

  it("nilai kosong yang tersimpan dibaca sebagai belum login", async () => {
    const store = storePalsu();
    store.isi.set(REFRESH_TOKEN_KEY, "");
    expect(await createTokenStorage(store).getRefreshToken()).toBeNull();
  });

  it("Keystore tidak terbaca → null, dan sisa nilainya dibuang", async () => {
    const store = storePalsu();
    store.isi.set(REFRESH_TOKEN_KEY, "rusak");
    store.getItemAsync = vi.fn(async () => {
      throw new Error("Could not decrypt the value");
    });

    expect(await createTokenStorage(store).getRefreshToken()).toBeNull();
    expect(store.isi.has(REFRESH_TOKEN_KEY)).toBe(false);
  });

  it("gagal membuang sisa nilai tetap tidak melempar", async () => {
    const store = storePalsu();
    store.getItemAsync = vi.fn(async () => {
      throw new Error("decrypt");
    });
    store.deleteItemAsync = vi.fn(async () => {
      throw new Error("delete");
    });

    expect(await createTokenStorage(store).getRefreshToken()).toBeNull();
  });
});
