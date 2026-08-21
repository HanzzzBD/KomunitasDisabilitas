// Permukaan publik @nawasena/ui — design system aksesibel (SDD §4.3).
//
// Set komponen MVP lengkap sejak PR-028c, ditambah pola keadaan kosong
// (PR-032b). Komponen domain (kartu lowongan dsb.) dibangun DI ATAS ini di PR
// fitur, bukan ditambahkan ke sini — batasnya "punya domain", bukan "baru".
export { gabungKelas } from "./gabung-kelas.js";
export { Tombol, type TombolProps, type VarianTombol, type UkuranTombol } from "./tombol.js";
export { Masukan, type MasukanProps } from "./masukan.js";
export { KolomForm, type KolomFormProps } from "./kolom-form.js";
export { AreaTeks, type AreaTeksProps } from "./area-teks.js";
export { Pilihan, type PilihanProps, type OpsiPilihan } from "./pilihan.js";
export { useKonteksKolom, type KontekKolom } from "./konteks-kolom.js";
export { Dialog, TutupDialog, type DialogProps } from "./dialog.js";
export {
  PenyediaToast,
  Toast,
  type PenyediaToastProps,
  type ToastProps,
  type AksiToast,
} from "./toast.js";
export {
  Kerangka,
  WilayahMemuat,
  type KerangkaProps,
  type WilayahMemuatProps,
} from "./kerangka.js";
export { Tab, type TabProps, type ItemTab } from "./tab.js";
export { Kartu, type KartuProps, type TingkatJudul } from "./kartu.js";
export { KeadaanKosong, type KeadaanKosongProps } from "./keadaan-kosong.js";
// Dipromosikan dari `apps/web/src/features/onboarding` di PR-036, setelah
// pemakai keduanya (panel preferensi) benar-benar lahir — lihat catatan
// panjang di berkasnya.
export { KotakCentang, type KotakCentangProps } from "./kotak-centang.js";
