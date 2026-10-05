// Tombol Keluar + konfirmasi (PR-090; pindah dari Beranda ke tab Profil di
// PR-093 karena Beranda kini menjadi feed). Keluar berarti mengulang OTP —
// mahal bagi pengguna yang harus menunggu kode di kanal lain, jadi dikonfirmasi.
import { Dialog, Tombol } from "@nawasena/ui-native";
import { useRef, useState } from "react";
import type { View } from "react-native";

import { sesiStore } from "../api";

export function TombolKeluar() {
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [keluar, setKeluar] = useState(false);
  const tombol = useRef<View>(null);

  return (
    <>
      <Tombol
        ref={tombol}
        testID="tombol-keluar"
        label="Keluar"
        varian="sekunder"
        onPress={() => setKonfirmasi(true)}
      />
      <Dialog
        testID="dialog-keluar"
        terbuka={konfirmasi}
        tutup={() => setKonfirmasi(false)}
        judul="Keluar dari Nawasena?"
        deskripsi="Anda perlu memasukkan kode lagi untuk masuk kembali."
        labelTutup="Batal"
        pemicu={tombol}
      >
        <Tombol
          testID="tombol-keluar-yakin"
          label={keluar ? "Sedang keluar" : "Ya, keluar"}
          sibuk={keluar}
          varian="bahaya"
          onPress={() => {
            if (keluar) return;
            setKeluar(true);
            void sesiStore.getState().keluar();
          }}
        />
      </Dialog>
    </>
  );
}
