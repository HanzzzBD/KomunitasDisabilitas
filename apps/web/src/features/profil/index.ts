// Permukaan publik fitur profil (PR-040). Halaman mengimpor dari sini, bukan
// dari berkas dalamnya — penataan ulang di dalam tidak menyentuh pemakainya.
export { BagianProfil, type BagianProfilProps } from "./bagian.js";
export {
  BagianDasar,
  keNilaiDasar,
  keBadanDasar,
  type NilaiDasar,
  type BagianDasarProps,
} from "./bagian-dasar.js";
export {
  BagianSensitif,
  keNilaiSensitif,
  keBadanSensitif,
  BADAN_CABUT,
  SENSITIF_KOSONG,
  type NilaiSensitif,
  type BagianSensitifProps,
} from "./bagian-sensitif.js";
export {
  DaftarKarier,
  gabungKeterangan,
  teksAtauNull,
  angkaAtauNull,
  type KonfigKarier,
  type KolomKarier,
  type NilaiBaris,
} from "./daftar-karier.js";
export { konfigPengalaman, konfigPendidikan, konfigKeahlian } from "./karier.js";
export {
  pesanGalatSimpan,
  galatPerKolom,
  periksa,
  type GalatKolom,
  type HasilPeriksa,
} from "./pesan-galat.js";
