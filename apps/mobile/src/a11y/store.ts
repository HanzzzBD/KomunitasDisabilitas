// Store preferensi aksesibilitas mobile (PR-091) — `createA11yStore` yang SAMA
// dengan web, dengan AsyncStorage sebagai penyimpanan (rancangan PR-026a).
//
// AsyncStorage, bukan SecureStore: preferensi bukan rahasia kredensial, dan ia
// harus terbaca cepat saat boot. Ia tetap tidak ikut backup (`allowBackup:
// false`, PR-088) dan dihapus saat keluar (koordinator onboarding).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";

/** Penyimpanan gagal → preferensi tetap berlaku sesi ini; app tidak boleh jatuh. */
export const penyimpananAsync: PenyimpananA11y & {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
} = {
  getItem: (k) => AsyncStorage.getItem(k).catch(() => null),
  setItem: (k, v) => AsyncStorage.setItem(k, v).catch(() => undefined),
  removeItem: (k) => AsyncStorage.removeItem(k).catch(() => undefined),
};

export const a11yStore = createA11yStore({ storage: penyimpananAsync });
