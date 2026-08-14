// Adapter WEB @nawasena/a11y — entry terpisah dari inti.
//
// Berkas di sini boleh menyentuh DOM. Berkas di `../` (inti) tidak boleh,
// sebab mobile mengimpornya dan di sana tidak ada `document`. Pemisahan ini
// ditegakkan penjaga: `web-terpisah.test.ts`.
export { terapkanToken, tokenDari, TARGET_SENTUH_PX, TANPA_TOKEN, type TokenA11y } from "./token.js";
export { bacaSinyalOS, pantauSinyalOS, KUERI_OS, type JendelaMedia } from "./os.js";
export { hubungkanKeDom, type OpsiHubungkan } from "./hubungkan.js";
