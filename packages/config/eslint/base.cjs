// Preset ESLint dasar bersama (legacy config) untuk seluruh workspace Incasif.
// Dikonsumsi via: module.exports = require("@incasif/config/eslint")
//
// CATATAN SCOPE: Aturan `eslint-plugin-boundaries` (module boundaries) SENGAJA
// belum ditambahkan di sini — itu cakupan PR-002 (Lint Boundaries). Preset ini
// hanya menyediakan fondasi TypeScript + Prettier-compatible formatting.
/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": "error",
    "no-console": "warn",
  },
  overrides: [
    {
      // File config CommonJS (.cjs/.js) wajib pakai require() — jangan larang.
      files: ["*.cjs", "*.js"],
      rules: {
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-var-requires": "off",
      },
    },
  ],
  ignorePatterns: ["dist/", "build/", "coverage/", "node_modules/", "*.tsbuildinfo"],
};
