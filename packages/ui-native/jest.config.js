// jest-expo merender komponen RN sungguhan (Android) — keputusan owner PR-089.
// Seluruh workspace lain tetap Vitest; Jest hanya hidup di paket native.
module.exports = {
  preset: "jest-expo/android",
  // Render RN PERTAMA di tiap berkas memuat modul RN secara malas (Modal dkk.) dan
  // di runner CI dingin melewati 5 dtk bawaan Jest — test Dialog pertama pernah
  // gagal karena itu (PR #206), bukan karena logikanya. Test yang macet sungguhan
  // tetap tertangkap, hanya lebih lambat.
  testTimeout: 30_000,
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
