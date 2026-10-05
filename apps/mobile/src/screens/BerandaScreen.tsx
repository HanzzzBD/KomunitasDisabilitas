// Beranda CADANGAN (PR-093): hanya tampil bila feed matching dimatikan lewat
// `EXPO_PUBLIC_MATCHING_FEED_ENABLED=false` (rollback, paritas web: fallback
// beranda = browse). Normalnya tab Beranda adalah `FeedScreen`.
import { Tombol } from "@nawasena/ui-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";

import { Judul, LayarGulir, Paragraf } from "../komponen/Layar";
import type { RootStackParamList } from "../navigation/types";

export function BerandaScreen() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <LayarGulir testID="layar-beranda">
      <Judul>Nawasena</Judul>
      <Paragraf>Masa Depan Karier Tanpa Batas</Paragraf>
      <Paragraf>Cari lowongan yang cocok untuk Anda.</Paragraf>
      <Tombol label="Cari lowongan" onPress={() => nav.navigate("Utama", { screen: "Cari" })} />
    </LayarGulir>
  );
}
