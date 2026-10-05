import { listNotifications, notificationsKeys } from "@nawasena/api-client";
import { UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "zustand";
import { apiClient } from "../api";
import { antreanTautan } from "../navigation/PantauTautan";
import { useSub } from "../query";
import { kabarNotifikasi } from "./instans";

function TombolNotifikasi() {
  const sub = useSub();
  const { warna, targetSentuh, skalaTeks } = useTokenA11y();
  const sinkron = useStore(kabarNotifikasi.store, (s) => s.sinkron);
  const { data: jumlah } = useQuery({
    queryKey: notificationsKeys.lencana(sub),
    queryFn: async () => (await listNotifications(apiClient, { limit: 1 })).meta.unreadCount,
    // Cache badge diisi monitor dan hasil read; bukan polling per header.
    enabled: false,
  });
  const label =
    jumlah === undefined
      ? "Notifikasi, jumlah belum tersedia"
      : `Notifikasi, ${jumlah} belum dibaca${sinkron === "gagal" ? ", jumlah belum bisa diperbarui" : ""}`;
  return (
    <Pressable
      testID="tombol-notifikasi"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Buka daftar notifikasi"
      onPress={() => antreanTautan.tujuan({ layar: "Notifikasi" })}
      style={({ pressed }) => ({
        minHeight: targetSentuh,
        minWidth: targetSentuh,
        padding: 12,
        gap: 8,
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        borderWidth: 1,
        borderColor: warna.garis,
        borderRadius: 8,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        importantForAccessibility="no"
        style={{ color: warna.teks, fontWeight: "600", fontSize: UKURAN_HURUF.label * skalaTeks }}
      >
        Notifikasi
      </Text>
      {jumlah === undefined || jumlah > 0 ? (
        <Text
          importantForAccessibility="no"
          style={{
            color: warna.diAtasUtama,
            backgroundColor: warna.utama,
            paddingHorizontal: 8,
            borderRadius: 8,
            fontSize: UKURAN_HURUF.label * skalaTeks,
          }}
        >
          {jumlah === undefined ? "?" : jumlah > 99 ? "99+" : jumlah}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Header dapat membungkus pada font besar; tombol tetap punya label teks. */
export function HeaderNotifikasi({ judul }: { judul: string }) {
  const { warna, skalaTeks } = useTokenA11y();
  const adaBanner = useStore(kabarNotifikasi.store, (s) => s.siap && s.banner !== null);
  return (
    <SafeAreaView edges={adaBanner ? [] : ["top"]} style={{ backgroundColor: warna.latar }}>
      <View
        style={{
          padding: 16,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderColor: warna.garis,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            color: warna.teks,
            flexShrink: 1,
            fontWeight: "700",
            fontSize: UKURAN_HURUF.judul * skalaTeks,
          }}
        >
          {judul}
        </Text>
        <TombolNotifikasi />
      </View>
    </SafeAreaView>
  );
}
