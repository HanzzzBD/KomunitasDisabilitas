import { View } from "react-native";

/** Small vector-like marks drawn with native views; hidden from assistive technology. */
export function IkonTab({
  jenis,
  warna,
}: {
  jenis: "Beranda" | "Cari" | "Lamaran" | "Cv" | "Profil";
  warna: string;
}) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
    >
      {jenis === "Profil" ? (
        <>
          <View
            style={{ width: 9, height: 9, borderWidth: 2, borderColor: warna, borderRadius: 6 }}
          />
          <View
            style={{
              width: 20,
              height: 10,
              borderWidth: 2,
              borderColor: warna,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              marginTop: 2,
            }}
          />
        </>
      ) : (
        <View
          style={{
            width: jenis === "Cari" ? 22 : 18,
            height: jenis === "Beranda" ? 15 : 21,
            borderWidth: 2,
            borderColor: warna,
            borderRadius: 3,
            justifyContent: "space-evenly",
            padding: 3,
          }}
        >
          {jenis === "Beranda" ? (
            <View style={{ width: 6, height: 7, backgroundColor: warna, alignSelf: "center" }} />
          ) : (
            <>
              <View style={{ height: 2, backgroundColor: warna }} />
              <View style={{ height: 2, backgroundColor: warna }} />
            </>
          )}
        </View>
      )}
    </View>
  );
}
