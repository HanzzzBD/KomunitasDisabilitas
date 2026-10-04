// Kartu native. Dua bentuk, dibedakan tipe:
//   - statis: wadah biasa; isinya dibaca satu per satu (judul, teks, tombol di dalamnya);
//   - dapat ditekan: seluruh kartu satu tombol, dan karena itu WAJIB berlabel —
//     TalkBack meringkas isinya menjadi satu nama, dan nama itu yang kita tulis.
// Kartu yang dapat ditekan tidak boleh berisi tombol lain: dua target bersarang
// tidak bisa dijangkau terpisah oleh TalkBack.
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTokenA11y } from "./konteks";

interface DasarKartu {
  children: ReactNode;
  testID?: string;
}

export type KartuProps =
  | (DasarKartu & { onPress?: undefined; label?: undefined; petunjuk?: undefined })
  | (DasarKartu & { onPress: () => void; label: string; petunjuk?: string });

export function Kartu(props: KartuProps) {
  const { warna, targetSentuh } = useTokenA11y();
  const gaya = {
    padding: 16,
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: warna.garis,
    backgroundColor: warna.latar,
  } as const;

  if (props.onPress) {
    return (
      <Pressable
        testID={props.testID}
        accessibilityRole="button"
        accessibilityLabel={props.label}
        accessibilityHint={props.petunjuk}
        onPress={props.onPress}
        style={({ pressed }) => ({ ...gaya, minHeight: targetSentuh, opacity: pressed ? 0.85 : 1 })}
      >
        {props.children}
      </Pressable>
    );
  }

  return (
    <View testID={props.testID} style={gaya}>
      {props.children}
    </View>
  );
}
