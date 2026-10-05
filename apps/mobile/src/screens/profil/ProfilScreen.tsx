// Tab Profil (PR-092): daftar bagian profil — satu bagian per layar.
//
// Paritas "simpan per bagian" web (PR-040): tiap bagian punya tombol simpan dan
// jalur kegagalannya sendiri, jadi satu tanggal yang salah tidak menghanguskan
// isian bagian lain.
import { Kartu, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { Text } from "react-native";

import { Judul, LayarGulir, Paragraf } from "../../komponen/Layar";
import { PrivasiAnalitik } from "../../analitik/PrivasiAnalitik";
import { TombolKeluar } from "../../komponen/TombolKeluar";
import type { RootStackParamList } from "../../navigation/types";

type Tujuan =
  | { layar: "ProfilDasar" }
  | { layar: "ProfilSensitif" }
  | { layar: "Karier"; jenis: "pengalaman" | "pendidikan" | "keahlian" };

const BAGIAN: readonly { judul: string; isi: string; tujuan: Tujuan; testID: string }[] = [
  {
    judul: "Data dasar",
    isi: "Judul profil, ringkasan, kota, dan siapa yang boleh tahu soal disabilitas Anda.",
    tujuan: { layar: "ProfilDasar" },
    testID: "bagian-dasar",
  },
  {
    judul: "Disabilitas dan akomodasi",
    isi: "Data pribadi. Hanya disimpan kalau Anda izinkan.",
    tujuan: { layar: "ProfilSensitif" },
    testID: "bagian-sensitif",
  },
  {
    judul: "Pengalaman kerja",
    isi: "Tempat Anda pernah bekerja.",
    tujuan: { layar: "Karier", jenis: "pengalaman" },
    testID: "bagian-pengalaman",
  },
  {
    judul: "Pendidikan",
    isi: "Sekolah atau kampus Anda.",
    tujuan: { layar: "Karier", jenis: "pendidikan" },
    testID: "bagian-pendidikan",
  },
  {
    judul: "Keahlian",
    isi: "Hal yang Anda kuasai.",
    tujuan: { layar: "Karier", jenis: "keahlian" },
    testID: "bagian-keahlian",
  },
];

export function ProfilScreen() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const { warna, skalaTeks } = useTokenA11y();

  return (
    <LayarGulir testID="layar-profil">
      <Judul>Profil saya</Judul>
      <Paragraf>Profil membantu kami mencarikan kerja yang cocok. Isi bagian mana saja.</Paragraf>
      {BAGIAN.map(({ judul, isi, tujuan, testID }) => (
        <Kartu
          key={testID}
          testID={testID}
          label={judul}
          petunjuk={isi}
          onPress={() =>
            tujuan.layar === "Karier"
              ? nav.navigate("Karier", { jenis: tujuan.jenis })
              : nav.navigate(tujuan.layar)
          }
        >
          <Text
            style={{ color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks, fontWeight: "700" }}
          >
            {judul}
          </Text>
          <Text style={{ color: warna.teksLemah, fontSize: UKURAN_HURUF.label * skalaTeks }}>
            {isi}
          </Text>
        </Kartu>
      ))}
      <Judul tingkat={2}>Akun</Judul>
      <PrivasiAnalitik />
      <TombolKeluar />
    </LayarGulir>
  );
}
