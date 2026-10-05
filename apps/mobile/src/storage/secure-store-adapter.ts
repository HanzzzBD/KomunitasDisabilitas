// Satu-satunya tempat `expo-secure-store` diimpor. Lihat token-storage.ts.
import * as SecureStore from "expo-secure-store";

import { createTokenStorage, type SecureStoreAdapter } from "./token-storage";

// THIS_DEVICE_ONLY: nilai tidak ikut backup/migrasi ke perangkat lain. Di Android
// SecureStore memang tidak ikut Auto Backup; opsi ini menyamakan perilaku iOS
// (Fase 2) supaya keputusan itu tidak perlu diingat ulang nanti.
const OPSI: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const adaptor: SecureStoreAdapter = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, OPSI),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, OPSI),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, OPSI),
};

export const tokenStorage = createTokenStorage(adaptor);
