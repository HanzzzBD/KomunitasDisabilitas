import { Tombol } from "@nawasena/ui-native";
import { useState } from "react";
import { Linking } from "react-native";

import { Paragraf, PesanStatus } from "../komponen/Layar";
import { pushConfigure } from "./android";
import { registrasiPush } from "./instans";

export function AktifkanPush() {
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string>();
  const [galat, setGalat] = useState(false);
  const [ditolak, setDitolak] = useState(false);
  if (!pushConfigure)
    return (
      <Paragraf lemah>
        Notifikasi HP belum tersedia di versi ini. Kabar tetap bisa dibaca dan dimuat ulang di
        aplikasi.
      </Paragraf>
    );
  return (
    <>
      <Paragraf>
        Aktifkan notifikasi HP untuk mendapat kabar lamaran dan CV, termasuk saat aplikasi ditutup.
      </Paragraf>
      <Tombol
        testID="tombol-aktifkan-push"
        label="Aktifkan notifikasi HP"
        sibuk={sibuk}
        onPress={() => {
          if (sibuk) return;
          setSibuk(true);
          setGalat(false);
          void registrasiPush
            .daftarkan(true)
            .then((perangkat) => {
              setDitolak(perangkat === null);
              setPesan(
                perangkat
                  ? "Notifikasi sudah aktif di HP ini."
                  : "Izin notifikasi belum diberikan. Kabar tetap tersedia di aplikasi.",
              );
            })
            .catch(() => {
              setGalat(true);
              setPesan("Notifikasi belum berhasil diaktifkan. Periksa koneksi, lalu coba lagi.");
            })
            .finally(() => setSibuk(false));
        }}
      />
      <PesanStatus pesan={pesan} galat={galat} />
      {ditolak ? (
        <Tombol
          label="Buka setelan notifikasi HP"
          varian="sekunder"
          onPress={() => {
            void Linking.openSettings().catch(() =>
              setPesan("Buka Setelan HP, lalu pilih aplikasi Nawasena dan Notifikasi."),
            );
          }}
        />
      ) : null}
    </>
  );
}
