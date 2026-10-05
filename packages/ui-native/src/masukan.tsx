// Kolom isian native: label terlihat + TextInput berlabel + pesan galat.
//
// Label terlihat SELALU ada (bukan placeholder saja): placeholder hilang saat
// mengetik, dan pengguna dengan memori kerja terbatas kehilangan konteksnya.
// Galat diumumkan lewat live region dan ikut dibaca sebagai petunjuk kolom,
// jadi TalkBack menyebutnya baik saat muncul maupun saat kolom difokus ulang.
import { forwardRef } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

import { useTokenA11y } from "./konteks";
import { UKURAN_HURUF } from "./token";

type PropsDiteruskan = Pick<
  TextInputProps,
  | "autoComplete"
  | "keyboardType"
  | "secureTextEntry"
  | "textContentType"
  | "autoCapitalize"
  | "maxLength"
>;

export interface MasukanProps extends PropsDiteruskan {
  label: string;
  nilai: string;
  ubahNilai: (nilai: string) => void;
  /** Teks bantuan permanen di bawah kolom (format yang diharapkan, dsb.). */
  petunjuk?: string;
  /** Pesan galat; kosong/undefined = tidak ada galat. */
  galat?: string;
  testID?: string;
  /**
   * Kolom banyak baris (ringkasan, uraian — PR-092). Tinggi mengikuti isi
   * mulai dari ±4 baris; teks rata atas supaya baris pertama tidak tenggelam.
   */
  multiline?: boolean;
}

export const Masukan = forwardRef<TextInput, MasukanProps>(function Masukan(props, ref) {
  const { label, nilai, ubahNilai, petunjuk, galat, testID, multiline, ...diteruskan } = props;
  const { warna, targetSentuh, skalaTeks } = useTokenA11y();
  const adaGalat = Boolean(galat);
  const ukuran = UKURAN_HURUF.isi * skalaTeks;

  return (
    <View style={{ gap: 4 }}>
      {/* Label terlihat; TalkBack membaca nama dari accessibilityLabel kolom. */}
      <Text
        importantForAccessibility="no"
        style={{ color: warna.teks, fontSize: UKURAN_HURUF.label * skalaTeks, fontWeight: "600" }}
      >
        {label}
      </Text>
      <TextInput
        ref={ref}
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={[galat, petunjuk].filter(Boolean).join(". ") || undefined}
        value={nilai}
        onChangeText={ubahNilai}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={{
          minHeight: multiline ? Math.max(targetSentuh, ukuran * 6) : targetSentuh,
          paddingVertical: multiline ? 8 : 0,
          paddingHorizontal: 12,
          borderRadius: 8,
          // Galat ditandai garis lebih tebal DAN teks, bukan warna saja (WCAG 1.4.1).
          borderWidth: adaGalat ? 2 : 1,
          borderColor: adaGalat ? warna.bahaya : warna.garis,
          color: warna.teks,
          backgroundColor: warna.latar,
          fontSize: ukuran,
        }}
        {...diteruskan}
      />
      {petunjuk ? (
        <Text importantForAccessibility="no" style={{ color: warna.teksLemah, fontSize: ukuran }}>
          {petunjuk}
        </Text>
      ) : null}
      {adaGalat ? (
        <Text accessibilityLiveRegion="polite" style={{ color: warna.bahaya, fontSize: ukuran }}>
          {galat}
        </Text>
      ) : null}
    </View>
  );
});
