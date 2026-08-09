// Konfigurasi Tailwind apps/web. Seluruh keputusan desain ada di preset
// bersama (packages/config/tailwind) — berkas ini hanya menyatakan DI MANA
// kelasnya dicari.
const preset = require("@nawasena/config/tailwind");

/** @type {import("tailwindcss").Config} */
module.exports = {
  presets: [preset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    // Komponen packages/ui ikut dipindai: kelas yang hanya muncul di sana
    // akan dibuang Tailwind bila jalurnya tidak disebut, dan gejalanya adalah
    // komponen tanpa gaya sama sekali di produksi — tetapi normal saat dev.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};
