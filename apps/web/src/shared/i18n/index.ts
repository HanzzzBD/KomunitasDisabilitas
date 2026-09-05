// Permukaan publik i18n. Komponen mengimpor dari sini, bukan dari berkas
// dalamnya — sehingga penataan ulang di dalam tidak menyentuh pemakainya.
export { PenyediaI18n, useTeks, useModeBahasa, type FungsiTeks } from "./provider.js";
export { type KunciTeks } from "./katalog/index.js";
// Pemuatan malas katalog fitur. `muatKatalog` dipanggil dari `lazy:` di
// app/routes.ts — BUKAN dari komponen: memuat di dalam komponen berarti render
// pertama selalu kehilangan teksnya.
export {
  muatKatalog,
  sudahDimuat,
  FITUR_MALAS,
  type FiturMalas,
  type NamaFitur,
} from "./registri.js";
export { terjemah, interpolasi, type HasilTerjemah } from "./terjemah.js";
export { MODE_BAHASA, type ModeBahasa, type EntriTeks, type KatalogFitur, type ParamTeks } from "./tipe.js";
