// Tombol native. Pasangan `Tombol` web: varian dan warnanya sama, target
// sentuhnya dari token yang sama.
//
// `label` WAJIB dan sekaligus menjadi teks yang terlihat: nama yang dibaca
// TalkBack sama dengan yang dilihat pengguna (WCAG 2.5.3 Label in Name). Tombol
// ikon-saja sengaja belum ada — saat lahir, ia butuh label tersendiri.
import { forwardRef } from "react";
import { Pressable, Text, type View } from "react-native";

import { useTokenA11y } from "./konteks";
import { UKURAN_HURUF } from "./token";

export type VarianTombol = "utama" | "sekunder" | "bahaya";

export interface TombolProps {
  label: string;
  onPress: () => void;
  varian?: VarianTombol;
  /** Dibaca TalkBack sesudah label — akibat tindakan, bukan pengulangan label. */
  petunjuk?: string;
  nonaktif?: boolean;
  /** Proses berjalan: tombol nonaktif dan TalkBack menyebut "sibuk". */
  sibuk?: boolean;
  testID?: string;
}

export const Tombol = forwardRef<View, TombolProps>(function Tombol(props, ref) {
  const { label, onPress, varian = "utama", petunjuk, nonaktif = false, sibuk = false } = props;
  const { warna, targetSentuh, skalaTeks } = useTokenA11y();
  const tidakAktif = nonaktif || sibuk;

  const latar = varian === "utama" ? warna.utama : varian === "bahaya" ? warna.bahaya : warna.latar;
  const teks =
    varian === "utama" ? warna.diAtasUtama : varian === "bahaya" ? warna.diAtasBahaya : warna.teks;

  return (
    <Pressable
      ref={ref}
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={petunjuk}
      accessibilityState={{ disabled: tidakAktif, busy: sibuk }}
      disabled={tidakAktif}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: targetSentuh,
        minWidth: targetSentuh,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: varian === "sekunder" ? warna.garis : latar,
        backgroundColor: latar,
        alignItems: "center",
        justifyContent: "center",
        // Nonaktif ditandai teks status (accessibilityState), bukan hanya pudar.
        opacity: tidakAktif ? 0.55 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        // Teks di dalam tombol tidak dibaca terpisah: Pressable sudah menyebut label.
        importantForAccessibility="no"
        style={{ color: teks, fontSize: UKURAN_HURUF.label * skalaTeks, fontWeight: "600" }}
      >
        {label}
      </Text>
    </Pressable>
  );
});
