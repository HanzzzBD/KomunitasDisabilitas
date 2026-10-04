// Penyimpanan refresh token mobile (PR-088, ADR-011).
//
// Refresh token HANYA boleh tinggal di SecureStore (Android Keystore), tidak
// pernah di AsyncStorage: AsyncStorage adalah berkas teks polos yang ikut
// terbaca lewat backup perangkat dan oleh siapa pun yang memegang APK debug.
//
// Modul ini sengaja tidak mengimpor `expo-secure-store` sendiri. Adaptornya
// disuntikkan (lihat `secure-store-adapter.ts`), sehingga perilakunya bisa diuji
// di Vitest tanpa runtime React Native — dan sehingga mengganti penyimpanan
// tidak bisa dilakukan diam-diam dengan menyalin satu baris impor.

/** Subset API `expo-secure-store` yang dipakai. */
export interface SecureStoreAdapter {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface TokenStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clearRefreshToken(): Promise<void>;
}

/**
 * Kunci SecureStore hanya boleh berisi alfanumerik, `.`, `-`, dan `_`.
 * Versi di nama kunci: format token berubah → kunci baru, bukan menimpa diam-diam.
 */
export const REFRESH_TOKEN_KEY = "nawasena.refresh_token.v1";

/**
 * Batas Android SecureStore praktis ~2 KB per nilai. Refresh token API jauh di
 * bawahnya; nilai lebih besar berarti ada yang salah dikirim ke sini (mis. seluruh
 * respons sesi), dan itu lebih baik gagal keras daripada tersimpan.
 */
export const BATAS_PANJANG_TOKEN = 2048;

export function createTokenStorage(store: SecureStoreAdapter): TokenStorage {
  return {
    async getRefreshToken() {
      try {
        const nilai = await store.getItemAsync(REFRESH_TOKEN_KEY);
        return nilai && nilai.length > 0 ? nilai : null;
      } catch {
        // Keystore bisa rusak (mis. setelah kunci layar perangkat diganti) dan
        // nilainya tidak bisa didekripsi lagi. Perlakukan sebagai "belum login"
        // dan buang sisanya agar percobaan berikutnya tidak gagal di tempat sama.
        await store.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined);
        return null;
      }
    },

    async setRefreshToken(token) {
      if (token.length === 0 || token.trim() !== token) {
        throw new Error("Refresh token kosong atau mengandung spasi di tepi.");
      }
      if (token.length > BATAS_PANJANG_TOKEN) {
        throw new Error("Refresh token terlalu panjang untuk SecureStore.");
      }
      await store.setItemAsync(REFRESH_TOKEN_KEY, token);
    },

    async clearRefreshToken() {
      await store.deleteItemAsync(REFRESH_TOKEN_KEY);
    },
  };
}
