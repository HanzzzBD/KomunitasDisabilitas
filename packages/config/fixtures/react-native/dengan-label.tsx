// Fixture SAH aturan label RN (PR-089): nol error.
import { Pressable, Switch, Text, TextInput, View } from "react-native";

export function DenganLabel(props: { label: string }) {
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={props.label} onPress={() => undefined}>
        <Text>{props.label}</Text>
      </Pressable>
      <TextInput accessibilityLabel="Email" />
      <Switch accessibilityLabel="Notifikasi email" value />
      {/* Elemen non-interaktif tidak diwajibkan berlabel. */}
      <Text>Teks biasa</Text>
    </View>
  );
}
