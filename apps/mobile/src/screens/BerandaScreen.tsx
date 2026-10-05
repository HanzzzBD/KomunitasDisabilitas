// Layar beranda (PR-088 shell). Sejak PR-089 warna dan ukuran huruf datang dari
// token a11y; sejak PR-090 hanya terjangkau saat masuk, dengan tombol Keluar.
// Isi fitur menyusul (PR-091+).
import { Dialog, Tombol, useTokenA11y, UKURAN_HURUF } from "@nawasena/ui-native";
import { useRef, useState } from "react";
import { Text, View, type TextStyle } from "react-native";

import { sesiStore } from "../api";

export function BerandaScreen() {
  const { warna, skalaTeks } = useTokenA11y();
  const [konfirmasi, setKonfirmasi] = useState(false);
  const tombolKeluar = useRef<View>(null);
  const teks: TextStyle = {
    color: warna.teks,
    fontSize: UKURAN_HURUF.isi * skalaTeks,
    textAlign: "center",
  };

  return (
    <View
      testID="layar-beranda"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 12,
        backgroundColor: warna.latar,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: warna.teks, fontSize: UKURAN_HURUF.judul * skalaTeks, fontWeight: "700" }}
      >
        Nawasena
      </Text>
      <Text style={teks}>Masa Depan Karier Tanpa Batas</Text>
      <Text style={teks}>Anda sudah masuk. Fitur lain akan segera hadir.</Text>

      <Tombol
        ref={tombolKeluar}
        testID="tombol-keluar"
        label="Keluar"
        varian="sekunder"
        onPress={() => setKonfirmasi(true)}
      />

      {/* Konfirmasi: keluar berarti mengulang OTP — mahal bagi pengguna yang
          harus menunggu kode di kanal lain. */}
      <Dialog
        testID="dialog-keluar"
        terbuka={konfirmasi}
        tutup={() => setKonfirmasi(false)}
        judul="Keluar dari Nawasena?"
        deskripsi="Anda perlu memasukkan kode lagi untuk masuk kembali."
        labelTutup="Batal"
        pemicu={tombolKeluar}
      >
        <Tombol
          testID="tombol-keluar-yakin"
          label="Ya, keluar"
          varian="bahaya"
          onPress={() => {
            setKonfirmasi(false);
            void sesiStore.getState().keluar();
          }}
        />
      </Dialog>
    </View>
  );
}
