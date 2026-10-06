const path = require("node:path");
// Reuse the shared native UI Jest/Expo infrastructure without a second dependency set.
// Explicit resolver paths also support pnpm's isolated node_modules layout.
const shared = path.resolve(__dirname, "../../packages/ui-native/node_modules");
const expo = require(require.resolve("jest-expo/android/jest-preset.js", { paths: [shared] }));
const babel = require.resolve("babel-jest", {
  paths: [require.resolve("jest-expo", { paths: [shared] })],
});
const babelPreset = require.resolve("babel-preset-expo", {
  paths: [path.dirname(require.resolve("expo/package.json", { paths: [shared] }))],
});
const runtime = path.dirname(
  require.resolve("@babel/runtime/package.json", {
    paths: [path.dirname(require.resolve("expo/package.json", { paths: [shared] }))],
  }),
);
module.exports = {
  ...expo,
  ...require("../../packages/ui-native/jest.config.js"),
  rootDir: __dirname,
  preset: undefined,
  modulePaths: [shared],
  moduleNameMapper: {
    ...require("../../packages/ui-native/jest.config.js").moduleNameMapper,
    "^@babel/runtime/(.*)$": `${runtime}/$1`,
  },
  testMatch: ["<rootDir>/__tests__/*.native.tsx"],
  transform: Object.fromEntries(
    Object.entries(expo.transform).map(([pattern, value]) => {
      if (Array.isArray(value) && value[0] === "babel-jest")
        return [pattern, [babel, { ...value[1], presets: [babelPreset] }]];
      if (value === "babel-jest") return [pattern, [babel, { presets: [babelPreset] }]];
      return [pattern, value];
    }),
  ),
};
