// Preset ESLint React (legacy config) untuk apps/web, packages/ui, packages/a11y.
// Dikonsumsi via: module.exports = require("@nawasena/config/eslint/react")
//
// Menumpuk di atas preset dasar, bukan menggantikannya: aturan TypeScript dan
// `no-console` tetap berlaku sama di seluruh workspace. Yang ditambahkan hanya
// yang benar-benar khas React.
//
// `eslint-plugin-jsx-a11y` MENYALA sejak PR-031a — sengaja ditunda dari
// PR-025a agar penyalaannya menjadi satu keputusan yang terlihat, bukan efek
// samping PR bootstrap.
//
// Dipakai preset `strict`, bukan `recommended`. Bedanya: `recommended`
// melonggarkan beberapa aturan yang punya pengecualian sah di aplikasi lama —
// dan proyek ini tidak punya kode lama. Melonggarkan sejak awal berarti
// memilih ambang yang lebih rendah tanpa satu pun pelanggaran yang menuntutnya.
//
// BATAS YANG HARUS DIKETAHUI: jsx-a11y adalah analisis STATIS. Ia melihat
// markup di satu berkas, bukan halaman yang sudah dirakit. Ia tidak bisa
// melihat kontras warna, urutan fokus, maupun label yang datang dari komponen
// lain. Lapisan keduanya `axe` per komponen (PR-031a, lihat
// @nawasena/a11y/pengujian), dan ketiganya axe+Lighthouse atas halaman nyata
// (PR-031b). Gerbang ini nyata, tetapi tidak lengkap sendirian.
const base = require("./base.cjs");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...base,
  plugins: [...base.plugins, "react", "react-hooks", "jsx-a11y"],
  extends: [
    ...base.extends,
    "plugin:react/recommended",
    // Menonaktifkan aturan yang menuntut `import React` — proyek ini memakai
    // JSX transform baru (tsconfig react: "jsx": "react-jsx").
    "plugin:react/jsx-runtime",
    // Gerbang aksesibilitas lapis pertama (PR-031a). `strict`, bukan
    // `recommended` — lihat catatan di kepala berkas.
    "plugin:jsx-a11y/strict",
  ],
  parserOptions: {
    ...base.parserOptions,
    ecmaFeatures: { jsx: true },
  },
  env: {
    ...base.env,
    // `node: true` tetap diwarisi: berkas config (vite.config.ts, skrip build)
    // hidup di sisi Node meski paketnya berisi kode browser.
    browser: true,
  },
  settings: {
    ...base.settings,
    react: { version: "detect" },
  },
  rules: {
    ...base.rules,
    // Dua aturan inti react-hooks. `exhaustive-deps` sengaja "error", bukan
    // "warn" bawaannya: dependensi efek yang tertinggal adalah sumber bug
    // stale-state yang tidak menimbulkan gejala sampai timing-nya kebetulan
    // berubah — persis jenis kegagalan yang tidak boleh lolos review.
    // KONSEKUENSI PENAMAAN yang berlaku ke seluruh proyek: hook kustom WAJIB
    // berawalan `use` (`useStatusJaringan`, bukan `gunakanStatusJaringan`).
    // Bukan karena bahasa Inggris lebih baik — `use` di sini bukan kata, ia
    // PENANDA PROTOKOL yang dibaca React dan aturan ini untuk mengenali bahwa
    // sebuah fungsi boleh memanggil hook lain. Kata domainnya tetap Indonesia.
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
  },
};
