import { Tombol } from "@nawasena/ui-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { PrivasiAnalitik } from "../../analitik/PrivasiAnalitik";
import { TombolKeluar } from "../../komponen/TombolKeluar";
import { Judul, LayarGulir, Paragraf } from "../../komponen/Layar";
import { LangkahPreferensi } from "../../onboarding/Langkah";
import type { RootStackParamList } from "../../navigation/types";
import { updateAccessibility } from "@nawasena/api-client";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { apiClient } from "../../api";
import { PesanStatus } from "../../komponen/Layar";

export function AksesibilitasScreen() {
  const simpan = useMutation({
    mutationFn: (perubahan: Parameters<typeof updateAccessibility>[1]) =>
      updateAccessibility(apiClient, perubahan),
  });
  const antrean = useRef<Promise<unknown>>(Promise.resolve());
  return (
    <LayarGulir testID="layar-aksesibilitas">
      <Judul>Aksesibilitas</Judul>
      <Paragraf>Pilihan langsung berlaku dan disimpan ke akun Anda.</Paragraf>
      <LangkahPreferensi
        onUbah={(perubahan) => {
          antrean.current = antrean.current.then(() =>
            simpan.mutateAsync(perubahan).catch(() => undefined),
          );
        }}
      />
      <PesanStatus
        pesan={
          simpan.isPending
            ? "Menyimpan pilihan."
            : simpan.isError
              ? "Belum tersimpan ke akun. Pilihan tetap berlaku di HP ini. Ubah lagi untuk mencoba menyimpan."
              : simpan.isSuccess
                ? "Pilihan tersimpan."
                : undefined
        }
        galat={simpan.isError}
      />
    </LayarGulir>
  );
}
export function PengaturanScreen() {
  return (
    <LayarGulir testID="layar-pengaturan">
      <Judul>Pengaturan akun</Judul>
      <PrivasiAnalitik />
      <TombolKeluar />
    </LayarGulir>
  );
}
export function BantuanScreen() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <LayarGulir testID="layar-bantuan">
      <Judul>Bantuan</Judul>
      <Judul tingkat={2}>Cari dan lamar pekerjaan</Judul>
      <Paragraf>
        Buka Lowongan untuk mencari pekerjaan dan memakai filter. Buka detail pekerjaan untuk
        melamar. Kabar lamaran ada di tab Lamaran.
      </Paragraf>
      <Judul tingkat={2}>Siapkan CV</Judul>
      <Paragraf>
        Buka tab CV untuk membuat CV dari profil, mengubah isinya, dan membuka PDF.
      </Paragraf>
      <Judul tingkat={2}>Atur tampilan</Judul>
      <Paragraf>
        Anda bisa memperbesar huruf dan tombol, menegaskan warna, atau mengurangi gerakan.
      </Paragraf>
      <Tombol label="Buka aksesibilitas" onPress={() => nav.navigate("Aksesibilitas")} />
    </LayarGulir>
  );
}
