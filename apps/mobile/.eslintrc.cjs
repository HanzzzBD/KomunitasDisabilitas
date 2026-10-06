const base = require("@nawasena/config/eslint/react-native");
module.exports = {
  ...base,
  overrides: [
    ...base.overrides,
    {
      files: ["__tests__/*.native.tsx"],
      env: { jest: true },
      rules: { "@typescript-eslint/no-require-imports": "off" },
    },
  ],
};
