// Pilihan tunggal (radio) native (PR-092). Pasangan `Pilihan` web.
//
// Radio, bukan dropdown: semua opsi terlihat sekaligus — tidak ada lapisan yang
// harus dibuka lalu ditutup, yang membingungkan pengguna autisme dan menambah
// langkah bagi pengguna motorik terbatas. TalkBack membaca nama grup (judul),
// lalu tiap opsi sebagai "tombol radio, dipilih/tidak dipilih, 2 dari 3".
import { Pressable, Text, View } from "react-native";

import { useTokenA11y } from "./konteks";
import { UKURAN_HURUF } from "./token";

export interface OpsiPilihan<T extends string> {
  nilai: T;
  label: string;
  bantuan?: string;
  nonaktif?: boolean;
}

export interface PilihanTunggalProps<T extends string> {
  /** Pertanyaan yang dijawab grup ini — terlihat DAN menjadi nama grup. */
  judul: string;
  opsi: readonly OpsiPilihan<T>[];
  nilai: T | null;
  onUbah: (nilai: T) => void;
  testID?: string;
}

export function PilihanTunggal<T extends string>(props: PilihanTunggalProps<T>) {
  const { judul, opsi, nilai, onUbah, testID } = props;
  const { warna, targetSentuh, skalaTeks } = useTokenA11y();
  const ukuran = Math.round(22 * Math.min(skalaTeks, 1.5));

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={judul}
      style={{ gap: 4 }}
    >
      <Text
        importantForAccessibility="no"
        style={{ color: warna.teks, fontSize: UKURAN_HURUF.label * skalaTeks, fontWeight: "600" }}
      >
        {judul}
      </Text>
      {opsi.map((o, i) => {
        const dipilih = o.nilai === nilai;
        return (
          <Pressable
            key={o.nilai}
            testID={testID ? `${testID}-${o.nilai}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityHint={o.bantuan}
            accessibilityState={{ checked: dipilih, ...(o.nonaktif ? { disabled: true } : {}) }}
            accessibilityValue={{ text: `${i + 1} dari ${opsi.length}` }}
            disabled={o.nonaktif}
            onPress={() => onUbah(o.nilai)}
            style={{
              minHeight: targetSentuh,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              paddingVertical: 8,
            }}
          >
            {/* Lingkaran luar + titik isi: status terlihat tanpa warna saja. */}
            <View
              style={{
                width: ukuran,
                height: ukuran,
                marginTop: 2,
                borderRadius: ukuran / 2,
                borderWidth: 2,
                borderColor: warna.teks,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {dipilih ? (
                <View
                  style={{
                    width: ukuran / 2,
                    height: ukuran / 2,
                    borderRadius: ukuran / 4,
                    backgroundColor: warna.teks,
                  }}
                />
              ) : null}
            </View>
            <View
              style={{ flex: 1, flexShrink: 1 }}
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={{ color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks }}>
                {o.label}
              </Text>
              {o.bantuan ? (
                <Text style={{ color: warna.teksLemah, fontSize: UKURAN_HURUF.label * skalaTeks }}>
                  {o.bantuan}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
