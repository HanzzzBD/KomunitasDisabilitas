// jest-expo merender komponen RN sungguhan (Android) — keputusan owner PR-089.
// Seluruh workspace lain tetap Vitest; Jest hanya hidup di paket native.
module.exports = {
  preset: "jest-expo/android",
  // pnpm menaruh paket di node_modules/.pnpm/<nama>@<versi>/node_modules/<nama>,
  // jadi pola bawaan jest-expo harus menoleransi segmen `.pnpm/...` itu.
  transformIgnorePatterns: [
    "node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*))",
  ],
  // Paket bersama (@nawasena/a11y, schemas) memakai impor relatif `.js` gaya
  // NodeNext yang menunjuk berkas `.ts`. Hanya `.js` persis — `.cjs` milik paket
  // npm tidak boleh ikut terpetakan.
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
};
