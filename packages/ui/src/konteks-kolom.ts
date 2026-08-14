// Kait antara KolomForm dan kontrol di dalamnya.
//
// AC 2 dan 3 (label terasosiasi programatik; galat diumumkan lewat
// `aria-describedby` + `aria-invalid`) bisa dipenuhi dengan menuliskan id
// secara manual di tiap pemakaian. Tetapi yang ditulis manual akan terlupa —
// dan yang terlupa di sini bukan "kolomnya jadi kurang rapi", melainkan
// pengguna screen reader tidak pernah tahu ada yang salah dengan isiannya.
//
// Karena itu KolomForm yang MEMBAGIKAN id-nya lewat konteks, dan kontrol yang
// MENGAMBILNYA. Tidak ada yang perlu diingat siapa pun.
import { createContext, useContext } from "react";

export interface KontekKolom {
  /** id kontrol; `<label for>` menunjuk ke sini. */
  id: string;
  /** Daftar id deskripsi (bantuan dan/atau galat), siap dipakai apa adanya. */
  describedBy: string | undefined;
  bermasalah: boolean;
  wajib: boolean;
}

/**
 * `null` berarti kontrol dipakai DI LUAR KolomForm.
 *
 * Sengaja bukan objek kosong: memakai kontrol tanpa KolomForm itu sah (mis. di
 * dalam toolbar dengan `aria-label` sendiri), dan menyamarkan keduanya akan
 * membuat kontrol yang lepas dari kolomnya tampak seolah terhubung.
 */
const Konteks = createContext<KontekKolom | null>(null);

export const PenyediaKonteksKolom = Konteks.Provider;

export function useKonteksKolom(): KontekKolom | null {
  return useContext(Konteks);
}
