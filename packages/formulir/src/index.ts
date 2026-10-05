// @nawasena/formulir — logika formulir profil & CV, murni (PR-092). Dipakai web
// dan mobile supaya aturan consent, pemetaan, dan urutan item tidak menyimpang.
export { angkaAtauNull, baca, gabungKeterangan, teksAtauNull, teksMentahAtauNull } from "./teks.js";
export { galatPerKolom, periksa, type GalatKolom, type HasilPeriksa } from "./galat.js";
export {
  alihkan,
  BADAN_CABUT,
  keBadanDasar,
  keBadanSensitif,
  keNilaiDasar,
  keNilaiSensitif,
  SENSITIF_KOSONG,
  type NilaiDasar,
  type NilaiSensitif,
} from "./profil.js";
export { hapusItem, pindahItem, ubahItem } from "./daftar.js";
export {
  buatKolomKeahlian,
  buatKolomOrganisasi,
  buatKolomPendidikan,
  buatKolomPengalaman,
  buatKolomSertifikat,
  buatKolomTautan,
  buatPrefillResume,
  KUNCI_LABEL_RESUME,
  type KolomItem,
  type KunciLabelResume,
  type LabelResume,
  type SumberPrefillResume,
} from "./resume.js";

export {
  ISIAN_AWAL,
  cvBawaan,
  dataUntukDiungkap,
  periksaIsian,
  type GalatIsian,
  type IsianLamar,
  type PilihanUngkap,
  type HasilPeriksaLamar,
} from "./lamar.js";
export { petakanLiniMasa, type EntriLiniMasa } from "./lini-masa.js";

export { profilCukupLengkap } from "./aktivasi.js";
