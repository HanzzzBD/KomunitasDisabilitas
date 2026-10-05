// Layar sementara saat sesi dipulihkan di boot (PR-090), dan saat server tak
// terjangkau padahal ada sesi tersimpan.
import { Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { ActivityIndicator, Text, View } from "react-native";

import { sesiStore } from "../api";

export function MemulihkanScreen() {
  const { warna } = useTokenA11y();
  return (
    <View
      testID="layar-memulihkan"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: warna.latar,
      }}
    >
      <ActivityIndicator
        size="large"
        color={warna.teks}
        accessibilityLabel="Memuat Nawasena"
        accessibilityRole="progressbar"
      />
    </View>
  );
}

export function TerputusScreen() {
  const { warna, skalaTeks } = useTokenA11y();
  return (
    <View
      testID="layar-terputus"
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        gap: 16,
        backgroundColor: warna.latar,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: warna.teks, fontSize: UKURAN_HURUF.judul * skalaTeks, fontWeight: "700" }}
      >
        Tidak bisa terhubung
      </Text>
      <Text style={{ color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks }}>
        Periksa internet Anda, lalu coba lagi. Anda tidak perlu masuk ulang.
      </Text>
      <Tombol
        testID="tombol-coba-lagi"
        label="Coba lagi"
        onPress={() => void sesiStore.getState().pulihkan()}
      />
    </View>
  );
}
