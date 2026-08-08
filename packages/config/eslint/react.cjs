// Preset ESLint React (legacy config) untuk apps/web, packages/ui, packages/a11y.
// Dikonsumsi via: module.exports = require("@nawasena/config/eslint/react")
//
// Menumpuk di atas preset dasar, bukan menggantikannya: aturan TypeScript dan
// `no-console` tetap berlaku sama di seluruh workspace. Yang ditambahkan hanya
// yang benar-benar khas React.
//
// `eslint-plugin-jsx-a11y` SENGAJA TIDAK di sini. Ia lahir bersama gerbang
// aksesibilitas (PR-031a) supaya penyalaannya menjadi satu keputusan yang
// terlihat, bukan efek samping dari PR bootstrap. Menyelipkannya sekarang
// berarti gerbang a11y "sudah menyala sebagian" tanpa ada yang memutuskan
// ambangnya — dan setengah gerbang lebih menyesatkan daripada tidak ada.
const base = require("./base.cjs");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...base,
  plugins: [...base.plugins, "react", "react-hooks"],
  extends: [
    ...base.extends,
    "plugin:react/recommended",
    // Menonaktifkan aturan yang menuntut `import React` — proyek ini memakai
    // JSX transform baru (tsconfig react: "jsx": "react-jsx").
    "plugin:react/jsx-runtime",
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
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
  },
};
