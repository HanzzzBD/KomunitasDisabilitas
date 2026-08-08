// Status daring/luring browser.
//
// Ada di `shared/` dan bukan `features/` karena ia tidak tahu apa pun tentang
// domain: tidak ada lowongan, lamaran, atau pengguna di sini.
//
// BATAS YANG HARUS DIKETAHUI PEMAKAI: `navigator.onLine` hanya melaporkan
// apakah perangkat punya SAMBUNGAN jaringan — bukan apakah server kita
// terjangkau. Wi-Fi hotel yang meminta login, atau API kita yang mati, tetap
// menghasilkan `true`. Karena itu banner luring adalah petunjuk, bukan vonis;
// kegagalan permintaan tetap harus punya pesannya sendiri (PR fitur), dan
// tombol "Coba lagi" tetap disediakan meski status terbaca daring.
import { useCallback, useEffect, useState } from "react";

/** Pembacaan aman di lingkungan tanpa `navigator` (SSR, test node). */
function bacaStatus(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export interface StatusJaringan {
  daring: boolean;
  /** Baca ulang status sekarang juga — dipakai tombol "Coba lagi". */
  periksaUlang: () => void;
}

export function useStatusJaringan(): StatusJaringan {
  const [daring, setDaring] = useState(bacaStatus);

  useEffect(() => {
    const perbarui = () => {
      setDaring(bacaStatus());
    };

    window.addEventListener("online", perbarui);
    window.addEventListener("offline", perbarui);

    // Baca sekali lagi setelah listener terpasang. Tanpa ini, perubahan yang
    // terjadi ANTARA render pertama dan pemasangan listener hilang tanpa jejak
    // — jendela sempit, tetapi persis jenis kondisi balapan yang muncul di
    // perangkat lambat dan tidak pernah muncul di mesin pengembang.
    perbarui();

    return () => {
      window.removeEventListener("online", perbarui);
      window.removeEventListener("offline", perbarui);
    };
  }, []);

  const periksaUlang = useCallback(() => {
    setDaring(bacaStatus());
  }, []);

  return { daring, periksaUlang };
}
