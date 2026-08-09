// Preset Tailwind bersama — SDD §107 ("packages/config: eslint, tsconfig,
// tailwind preset") dan SDD §189 ("seluruh Tailwind preset membaca token ini").
//
// TUGASNYA SATU: menjadikan token aksesibilitas (PR-026) sebagai satu-satunya
// jalan menulis ukuran dan warna. Selama preferensi hanya bisa dipakai lewat
// kelas Tailwind biasa, tidak ada komponen yang bisa "lupa" menghormatinya —
// dan itu jauh lebih kuat daripada mengandalkan setiap penulis mengingatnya.
//
// PILIHAN VERSI: Tailwind v3, bukan v4. v4 memindahkan konfigurasi ke CSS
// (`@theme`) dan meniadakan konsep "preset" yang SDD §107 sebut namanya. Repo
// ini juga menahan versi secara sadar di tempat lain (React 18, Vite 5). Bila
// kelak v4 dipilih, arsitektur berkas ini berubah bentuk — itu keputusan owner,
// bukan detail yang boleh berpindah diam-diam.

/**
 * Skala teks yang MENGALIKAN `--font-scale`.
 *
 * `calc()`, bukan angka mati: pengguna yang memilih teks 200% harus melihat
 * SELURUH teks membesar, termasuk yang ditulis dengan kelas ukuran tetap.
 * Nilai cadangan `1` wajib — skrip pra-paint bisa gagal di lingkungan yang
 * memblokir localStorage, dan teks tanpa ukuran lebih buruk daripada teks
 * berukuran normal.
 */
function skalaTeks(remDasar, tinggiBaris) {
  return [`calc(${remDasar}rem * var(--font-scale, 1))`, { lineHeight: tinggiBaris }];
}

/** @type {import("tailwindcss").Config} */
module.exports = {
  theme: {
    extend: {
      fontSize: {
        xs: skalaTeks(0.75, "1.5"),
        sm: skalaTeks(0.875, "1.5"),
        base: skalaTeks(1, "1.6"),
        lg: skalaTeks(1.125, "1.6"),
        xl: skalaTeks(1.25, "1.4"),
        "2xl": skalaTeks(1.5, "1.3"),
        "3xl": skalaTeks(1.875, "1.2"),
      },

      // Tinggi baris minimum 1.5 pada teks isi (WCAG 2.2 §1.4.12 Text Spacing).
      // Ditaruh di skala ukuran di atas, bukan sebagai kelas terpisah, supaya
      // ia ikut secara bawaan alih-alih harus diingat.

      spacing: {
        // Satu-satunya cara menulis ukuran target sentuh. Komponen memakai
        // `min-h-sentuh min-w-sentuh`, dan nilainya ikut preferensi pengguna
        // tanpa komponen itu tahu apa pun tentang preferensi.
        sentuh: "var(--touch-target-min, 44px)",
      },
      minHeight: { sentuh: "var(--touch-target-min, 44px)" },
      minWidth: { sentuh: "var(--touch-target-min, 44px)" },

      // Cincin fokus — AC PR-027 "fokus ring selalu terlihat di semua varian".
      // Tebal 3px, bukan 2px bawaan: pada kontras rendah dan layar kecil, 2px
      // hilang di antara piksel. Offset memisahkannya dari latar elemen supaya
      // tetap terlihat pada tombol berwarna gelap.
      ringWidth: { fokus: "3px" },
      ringOffsetWidth: { fokus: "2px" },
    },
  },

  plugins: [
    /**
     * Varian yang membaca atribut token (PR-026b).
     *
     * Memakai atribut, BUKAN `@media (prefers-*)` langsung: media query hanya
     * tahu setelan OS, sementara atribut sudah memperhitungkan pilihan
     * eksplisit pengguna yang boleh MENIMPA OS. Menulis
     * `motion-reduce:` bawaan Tailwind akan mengabaikan pilihan itu.
     */
    function ({ addVariant }) {
      addVariant("kontras-tinggi", '[data-contrast="high"] &');
      addVariant("gerak-minimal", '[data-motion="reduced"] &');
      addVariant("bahasa-sederhana", '[data-lang-mode="simple"] &');
    },
  ],
};
