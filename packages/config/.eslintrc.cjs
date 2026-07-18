module.exports = {
  ...require("./eslint/base.cjs"),
  // Fixtures adalah pelanggaran boundaries yang DISENGAJA + mereferensikan SDK
  // yang tidak terpasang. Di-lint terpisah lewat ESLint Node API di test,
  // jadi dikecualikan dari `pnpm lint` normal.
  ignorePatterns: ["fixtures/**"],
};
