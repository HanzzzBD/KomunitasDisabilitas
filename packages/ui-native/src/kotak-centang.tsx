// Kotak centang native (PR-091). Pasangan `KotakCentang` web.
//
// SELURUH BARIS adalah area sentuh — kotak 24 dp saja terlalu kecil bagi
// pengguna motorik terbatas, dan labelnya adalah sasaran yang wajar diketuk.
// TalkBack membaca satu elemen: label + "kotak centang" + "dicentang/tidak
// dicentang", lalu teks bantuan sebagai petunjuk.
//
// Tanda centang memakai simbol ✓ DAN isian kotak, bukan warna saja (WCAG 1.4.1).
import { Pressable, Text, View } from "react-native";

import { useTokenA11y } from "./konteks";
import { UKURAN_HURUF } from "./token";

export interface KotakCentangProps {
  label: string;
  dicentang: boolean;
  onUbah: (dicentang: boolean) => void;
  /** Teks bantuan terlihat di bawah label; juga dibaca sebagai petunjuk. */
  bantuan?: string;
  testID?: string;
  nonaktif?: boolean;
}

export function KotakCentang({
  label,
  dicentang,
  onUbah,
  bantuan,
  testID,
  nonaktif = false,
}: KotakCentangProps) {
  const { warna, targetSentuh, skalaTeks } = useTokenA11y();
  const ukuranKotak = Math.round(24 * Math.min(skalaTeks, 1.5));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityHint={bantuan}
      accessibilityState={{ checked: dicentang, disabled: nonaktif }}
      disabled={nonaktif}
      onPress={() => onUbah(!dicentang)}
      style={{
        minHeight: targetSentuh,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: ukuranKotak,
          height: ukuranKotak,
          marginTop: 2,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: warna.teks,
          backgroundColor: dicentang ? warna.utama : warna.latar,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {dicentang ? (
          <Text
            importantForAccessibility="no"
            style={{ color: warna.diAtasUtama, fontSize: ukuranKotak * 0.7, fontWeight: "700" }}
          >
            ✓
          </Text>
        ) : null}
      </View>
      {/* flex: 1 + flexShrink: label membungkus di skala teks 200%, tidak meluber. */}
      <View
        style={{ flex: 1, flexShrink: 1, gap: 2 }}
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          style={{ color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks, fontWeight: "600" }}
        >
          {label}
        </Text>
        {bantuan ? (
          <Text style={{ color: warna.teksLemah, fontSize: UKURAN_HURUF.label * skalaTeks }}>
            {bantuan}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
