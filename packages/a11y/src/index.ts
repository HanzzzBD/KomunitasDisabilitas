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

// Diteruskan agar pemakai tidak perlu bergantung pada @nawasena/schemas hanya
// untuk menyebut tipe preferensinya.
export {
  ACCESSIBILITY_DEFAULTS,
  type AccessibilityPreferences,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";
