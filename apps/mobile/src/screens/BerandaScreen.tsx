// Layar shell PR-088. Isi fitur menyusul (PR-090+). Sejak PR-089 warna dan
// ukuran huruf datang dari token a11y (@nawasena/ui-native), bukan angka mati.
import { useTokenA11y, UKURAN_HURUF } from "@nawasena/ui-native";
import { Text, View, type TextStyle } from "react-native";

export function BerandaScreen() {
  const { warna, skalaTeks } = useTokenA11y();
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
      <Text style={teks}>Aplikasi sedang disiapkan. Fitur akan segera hadir.</Text>
    </View>
  );
}
