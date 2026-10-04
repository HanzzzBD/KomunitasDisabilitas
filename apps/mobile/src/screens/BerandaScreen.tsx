// Layar shell PR-088. Isi fitur menyusul (PR-090+); komponen aksesibel bersama
// (packages/ui native) lahir di PR-089 — sampai saat itu hanya primitif RN.
import { StyleSheet, Text, View } from "react-native";

export function BerandaScreen() {
  return (
    <View style={gaya.wadah} testID="layar-beranda">
      <Text accessibilityRole="header" style={gaya.judul}>
        Nawasena
      </Text>
      <Text style={gaya.teks}>Masa Depan Karier Tanpa Batas</Text>
      <Text style={gaya.teks}>Aplikasi sedang disiapkan. Fitur akan segera hadir.</Text>
    </View>
  );
}

const gaya = StyleSheet.create({
  wadah: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  // #1A1A1A di atas putih: kontras ~17:1 (WCAG AA ≥ 4.5:1).
  judul: { fontSize: 28, fontWeight: "700", color: "#1A1A1A" },
  teks: { fontSize: 18, color: "#1A1A1A", textAlign: "center" },
});
