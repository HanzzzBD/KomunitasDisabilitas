// Kerangka layar formulir mobile (PR-092): gulir, judul, paragraf, status.
//
// Semua layar fitur MENGGULIR: pada font OS 200% + skala teks 200% tidak ada
// layar yang muat tanpa gulir, dan isi yang terpotong tanpa bisa digulir
// adalah isi yang hilang (AC PR-091 font ekstrem, berlaku juga di sini).
import { UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { useCallback, useRef, type ReactNode } from "react";
import { ActivityIndicator, AccessibilityInfo, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

export function LayarGulir(props: { testID: string; children: ReactNode }) {
  const { warna } = useTokenA11y();
  return (
    <ScrollView
      testID={props.testID}
      style={{ backgroundColor: warna.latar }}
      contentContainerStyle={{ padding: 24, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {props.children}
    </ScrollView>
  );
}

export function Judul(props: { children: string; tingkat?: 1 | 2 }) {
  const { warna, skalaTeks, kurangiGerak } = useTokenA11y();
  const nav = useNavigation();
  const ref = useRef<Text>(null);
  useFocusEffect(
    useCallback(() => {
      if (props.tingkat === 2) return;
      const fokus = () => {
        if (!nav.isFocused() || !ref.current) return;
        AccessibilityInfo.sendAccessibilityEvent(ref.current, "focus");
      };
      const timer = setTimeout(fokus, kurangiGerak ? 0 : 350);
      return () => clearTimeout(timer);
    }, [nav, props.tingkat, kurangiGerak]),
  );
  const besar = props.tingkat === 2 ? UKURAN_HURUF.isi + 2 : UKURAN_HURUF.judul;
  return (
    <Text
      ref={ref}
      accessible
      accessibilityRole="header"
      style={{ color: warna.teks, fontSize: besar * skalaTeks, fontWeight: "700" }}
    >
      {props.children}
    </Text>
  );
}

export function Paragraf(props: { children: ReactNode; tebal?: boolean; lemah?: boolean }) {
  const { warna, skalaTeks } = useTokenA11y();
  return (
    <Text
      style={{
        color: props.lemah ? warna.teksLemah : warna.teks,
        fontSize: UKURAN_HURUF.isi * skalaTeks,
        fontWeight: props.tebal ? "700" : "400",
      }}
    >
      {props.children}
    </Text>
  );
}

/**
 * Pesan hasil simpan/galat. SELALU dirender (kosong bila tidak ada pesan):
 * live region yang lahir bersama pesannya kerap tidak terbaca TalkBack.
 * Galat `assertive` — pengguna baru menekan Simpan dan menunggu jawaban.
 */
export function PesanStatus(props: { pesan?: string; galat?: boolean; testID?: string }) {
  const { warna, skalaTeks } = useTokenA11y();
  return (
    <View accessibilityLiveRegion={props.galat ? "assertive" : "polite"}>
      {props.pesan ? (
        <Text
          testID={props.testID}
          style={{
            color: props.galat ? warna.bahaya : warna.teks,
            fontSize: UKURAN_HURUF.isi * skalaTeks,
            fontWeight: "600",
          }}
        >
          {props.pesan}
        </Text>
      ) : null}
    </View>
  );
}

/** Memuat — indikator berlabel, bukan putaran bisu. */
export function Memuat(props: { label: string }) {
  const { warna } = useTokenA11y();
  return (
    <View style={{ padding: 24, alignItems: "center" }}>
      <ActivityIndicator
        color={warna.teks}
        accessibilityLabel={props.label}
        accessibilityRole="progressbar"
      />
    </View>
  );
}
