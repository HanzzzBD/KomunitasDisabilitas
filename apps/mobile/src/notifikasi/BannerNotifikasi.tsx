import { Tombol, useTokenA11y } from "@nawasena/ui-native";
import { AccessibilityInfo, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "zustand";
import { Judul, Paragraf, PesanStatus } from "../komponen/Layar";
import { antreanTautan } from "../navigation/PantauTautan";
import { useBahasaNotifikasi } from "./bahasa";
import { kabarNotifikasi } from "./instans";

/** Satu banner root, tanpa modal, timer penutupan, atau pemindahan fokus. */
export function BannerNotifikasi() {
  const banner = useStore(kabarNotifikasi.store, (s) => (s.siap ? s.banner : null));
  const bahasa = useBahasaNotifikasi();
  const { warna } = useTokenA11y();
  return (
    <SafeAreaView
      edges={banner ? ["top"] : []}
      style={{ maxHeight: "35%", flexShrink: 1, backgroundColor: warna.latar }}
    >
      {/* Selalu terpasang; isi hanya jumlah agar pengayaan data tidak diumumkan dua kali. */}
      <View style={{ paddingHorizontal: 16 }}>
        <PesanStatus
          pesan={banner ? `${banner.jumlah} notifikasi baru.` : undefined}
          testID="kabar-notifikasi"
        />
      </View>
      {banner ? (
        <ScrollView
          style={{ flexShrink: 1, borderBottomWidth: 1, borderColor: warna.garis }}
          testID="banner-notifikasi"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 8 }}
        >
          <Judul tingkat={2}>
            {banner.item ? banner.item.title[bahasa] : "Ada notifikasi baru"}
          </Judul>
          {banner.item ? <Paragraf>{banner.item.body[bahasa]}</Paragraf> : null}
          <Tombol
            label={banner.jumlah > 1 ? "Buka daftar notifikasi" : "Buka notifikasi"}
            testID="buka-banner-notifikasi"
            onPress={() => {
              const tujuan = banner.tujuan;
              kabarNotifikasi.tutup();
              antreanTautan.tujuan(tujuan);
            }}
          />
          <Tombol
            label="Tutup banner notifikasi"
            varian="sekunder"
            testID="tutup-banner-notifikasi"
            onPress={() => {
              kabarNotifikasi.tutup();
              AccessibilityInfo.announceForAccessibility(
                "Banner ditutup. Notifikasi tetap tersedia di daftar notifikasi.",
              );
            }}
          />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}
