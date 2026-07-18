// Preset Prettier bersama untuk seluruh workspace Incasif.
// Dikonsumsi via `@incasif/config/prettier`.
/** @type {import("prettier").Config} */
module.exports = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  bracketSpacing: true,
  arrowParens: "always",
  endOfLine: "lf",
};
