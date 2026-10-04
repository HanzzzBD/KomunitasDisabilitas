// Fixture PELANGGARAN aturan label RN (PR-089). Tiap elemen di bawah harus
// menghasilkan error `no-restricted-syntax` — jumlahnya dikunci di test.
import { Pressable, Switch, Text, TextInput, TouchableOpacity } from "react-native";

export function TanpaLabel() {
  return (
    <>
      {/* 2 error: label + role */}
      <Pressable onPress={() => undefined}>
        <Text>Kirim</Text>
      </Pressable>
      {/* 1 error: role (label ada) */}
      <TouchableOpacity accessibilityLabel="Simpan" onPress={() => undefined} />
      {/* 1 error: label */}
      <TextInput placeholder="Email" />
      {/* 1 error: label */}
      <Switch value />
      {/* 2 error: label di dalam render prop TIDAK dihitung milik Pressable */}
      <Pressable>{() => <TextInput accessibilityLabel="bersarang" />}</Pressable>
    </>
  );
}
