// Konfigurasi kolom item CV — kini di `@nawasena/formulir` (PR-092) supaya web
// dan mobile memakai definisi yang sama. `t` dioper sebagai fungsi label.
//
// `teksAtauNull` di sini adalah varian MENTAH (tanpa trim): editor menulis state
// per ketukan, dan merapikan di sana memakan spasi yang baru diketik.
export {
  angkaAtauNull,
  baca,
  buatKolomKeahlian,
  buatKolomOrganisasi,
  buatKolomPendidikan,
  buatKolomPengalaman,
  buatKolomSertifikat,
  buatKolomTautan,
  teksMentahAtauNull as teksAtauNull,
} from "@nawasena/formulir";
