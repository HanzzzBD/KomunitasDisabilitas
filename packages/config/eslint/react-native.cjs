// Preset ESLint React Native (legacy config) untuk apps/mobile dan packages/ui-native.
// Dikonsumsi via: module.exports = require("@nawasena/config/eslint/react-native")
//
// Kenapa bukan preset `react`: `eslint-plugin-jsx-a11y` membaca elemen DOM
// (`<button>`, `<img>`), sedangkan RN tidak punya satu pun. Di kode RN plugin itu
// diam — gerbang yang tampak menyala padahal tidak menjaga apa pun. Penggantinya
// adalah aturan label di bawah (PR-089, SDD §4.2).
//
// ATURAN LABEL. Elemen interaktif bawaan RN tanpa `accessibilityLabel` dibaca
// TalkBack sebagai "tombol" atau "kotak edit" saja — tanpa nama. Komponen
// `@nawasena/ui-native` mewajibkan label lewat tipe TypeScript; aturan ini
// menjaga sisanya: siapa pun yang memakai primitif RN langsung.
//
// Ditulis sebagai `no-restricted-syntax`, bukan plugin kustom: selektornya bisa
// dibaca di sini apa adanya, dan tidak ada paket plugin yang harus dirawat.
// Batasnya diketahui: label yang datang lewat spread (`{...props}`) tidak
// terlihat, jadi label WAJIB ditulis eksplisit pada elemennya.
const base = require("./base.cjs");

const DAPAT_DITEKAN =
  "Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|TouchableNativeFeedback";
const BERLABEL = "TextInput|Switch";

/** Elemen bernama `pola` yang TIDAK punya atribut `atribut` di dirinya sendiri. */
function tanpa(pola, atribut) {
  return `JSXOpeningElement[name.name=/^(${pola})$/]:not(:has(> JSXAttribute[name.name="${atribut}"]))`;
}

const ATURAN_LABEL = [
  {
    selector: tanpa(`${DAPAT_DITEKAN}|${BERLABEL}`, "accessibilityLabel"),
    message:
      "Elemen interaktif wajib punya accessibilityLabel eksplisit — tanpanya TalkBack hanya membaca jenisnya, tanpa nama. Pakai komponen @nawasena/ui-native bila bisa.",
  },
  {
    selector: tanpa(DAPAT_DITEKAN, "accessibilityRole"),
    message:
      'Elemen yang bisa ditekan wajib punya accessibilityRole (mis. "button", "link") — tanpanya TalkBack tidak menyebut bahwa elemen ini bisa diaktifkan.',
  },
];

/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...base,
  plugins: [...base.plugins, "react", "react-hooks"],
  extends: [...base.extends, "plugin:react/recommended", "plugin:react/jsx-runtime"],
  parserOptions: {
    ...base.parserOptions,
    ecmaFeatures: { jsx: true },
  },
  settings: {
    ...base.settings,
    react: { version: "detect" },
  },
  rules: {
    ...base.rules,
    // Alasan "error" untuk exhaustive-deps: lihat preset react.cjs.
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
    "no-restricted-syntax": ["error", ...ATURAN_LABEL],
  },
};
