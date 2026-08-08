// Permukaan publik i18n. Komponen mengimpor dari sini, bukan dari berkas
// dalamnya — sehingga penataan ulang di dalam tidak menyentuh pemakainya.
export { PenyediaI18n, useTeks, useModeBahasa, type FungsiTeks } from "./provider.js";
export { katalog, type KunciTeks } from "./katalog/index.js";
export { terjemah, interpolasi, type HasilTerjemah } from "./terjemah.js";
export { MODE_BAHASA, type ModeBahasa, type EntriTeks, type KatalogFitur, type ParamTeks } from "./tipe.js";
