// Permukaan publik @nawasena/a11y — INTI, bebas DOM.
//
// Adapter web (menulis token ke `<html>`, membaca `prefers-*`) lahir di
// PR-026b sebagai entry terpisah, supaya mobile bisa memakai berkas-berkas di
// sini tanpa pernah menyentuh sesuatu yang mengasumsikan browser.
export {
  createA11yStore,
  bersihkanTersimpan,
  KUNCI_PENYIMPANAN,
  VERSI_STORE,
  type A11yState,
  type A11yStore,
  type OpsiStore,
} from "./store.js";

export { rekonsiliasi, dipilihPengguna, type SinyalOS } from "./rekonsiliasi.js";

/**
 * Kontrak penyimpanan yang harus disediakan pemanggil.
 *
 * Diteruskan dari Zustand dengan nama sendiri supaya pemakai paket ini tidak
 * perlu memasang zustand hanya untuk MENYEBUT tipe argumen. Bahwa store-nya
 * kebetulan Zustand adalah detail implementasi — dan detail implementasi yang
 * bocor ke `package.json` pemakainya berhenti bisa diganti.
 */
export type { StateStorage as PenyimpananA11y } from "zustand/middleware";

// Diteruskan agar pemakai tidak perlu bergantung pada @nawasena/schemas hanya
// untuk menyebut tipe preferensinya.
export {
  ACCESSIBILITY_DEFAULTS,
  type AccessibilityPreferences,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";
