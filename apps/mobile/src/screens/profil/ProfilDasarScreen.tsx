// Bagian data dasar profil (PR-092; paritas `BagianDasar` web, PR-040).
// Tidak ada satu pun field sensitif di sini — lihat `@nawasena/formulir/profil`.
import { getProfile, profilesKeys, updateProfile } from "@nawasena/api-client";
import {
  keBadanDasar,
  keNilaiDasar,
  periksa,
  type GalatKolom,
  type NilaiDasar,
} from "@nawasena/formulir";
import { updateSeekerProfileSchema } from "@nawasena/schemas";
import { KotakCentang, Masukan, PilihanTunggal, Tombol } from "@nawasena/ui-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiClient } from "../../api";
import { pesanGalat } from "../../auth/alur-masuk";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, LayarGulir, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import { useSub } from "../../query";

export const OPSI_PENGUNGKAPAN = [
  {
    nilai: "ask_each_time",
    label: "Tanya saya dulu setiap melamar",
    bantuan: "Pilihan paling aman. Anda memutuskan untuk tiap lowongan.",
  },
  {
    nilai: "always",
    label: "Selalu beri tahu perusahaan",
    bantuan: "Data disabilitas ikut terkirim bersama lamaran.",
  },
  {
    nilai: "never",
    label: "Jangan pernah beri tahu",
    bantuan: "Perusahaan tidak melihat data disabilitas Anda.",
  },
] as const;

export function ProfilDasarScreen() {
  const sub = useSub();
  const qc = useQueryClient();
  const profil = useQuery({ queryKey: profilesKeys.me(sub), queryFn: () => getProfile(apiClient) });
  const [nilai, setNilai] = useState<NilaiDasar | null>(null);
  const [galat, setGalat] = useState<GalatKolom>({});
  const [pesan, setPesan] = useState<{ teks: string; galat: boolean }>();

  // Isi formulir SEKALI dari server — pemuatan ulang di latar tidak boleh
  // menimpa ketikan yang belum disimpan.
  useEffect(() => {
    if (profil.data && nilai === null) setNilai(keNilaiDasar(profil.data));
  }, [profil.data, nilai]);

  const simpan = useMutation({
    mutationFn: (badan: Parameters<typeof updateProfile>[1]) => updateProfile(apiClient, badan),
    onSuccess: (baru) => {
      qc.setQueryData(profilesKeys.me(sub), baru);
      setNilai(keNilaiDasar(baru));
      setPesan({ teks: "Data dasar tersimpan.", galat: false });
    },
    onError: (err) => setPesan({ teks: pesanGalat(err), galat: true }),
  });

  function kirim() {
    if (nilai === null) return;
    setPesan(undefined);
    const hasil = periksa(updateSeekerProfileSchema, keBadanDasar(nilai));
    if (!hasil.ok) {
      setGalat(hasil.galat);
      setPesan({ teks: "Ada isian yang perlu diperbaiki.", galat: true });
      return;
    }
    setGalat({});
    simpan.mutate(hasil.nilai);
  }

  const ubah = (sebagian: Partial<NilaiDasar>) =>
    setNilai((n) => (n === null ? n : { ...n, ...sebagian }));

  return (
    <LayarGulir testID="layar-profil-dasar">
      <Judul>Data dasar</Judul>
      {profil.isError ? (
        <GagalMuat galat={profil.error} ulang={() => void profil.refetch()} />
      ) : null}
      {nilai === null ? (
        profil.isError ? null : (
          <Memuat label="Memuat profil" />
        )
      ) : (
        <>
          <Paragraf lemah>Bagian ini boleh dilihat perusahaan yang menerima lamaran Anda.</Paragraf>
          <Masukan
            testID="masukan-headline"
            label="Judul profil"
            petunjuk="Contoh: Penulis konten dan desainer grafis."
            nilai={nilai.headline}
            ubahNilai={(headline) => ubah({ headline })}
            galat={galat.headline}
            maxLength={120}
          />
          <Masukan
            testID="masukan-ringkasan"
            label="Ringkasan tentang Anda"
            nilai={nilai.summary}
            ubahNilai={(summary) => ubah({ summary })}
            galat={galat.summary}
            maxLength={2000}
            multiline
          />
          <Masukan
            label="Kota"
            nilai={nilai.city}
            ubahNilai={(city) => ubah({ city })}
            galat={galat.city}
            maxLength={80}
            autoComplete="postal-address-locality"
          />
          <Masukan
            label="Provinsi"
            nilai={nilai.province}
            ubahNilai={(province) => ubah({ province })}
            galat={galat.province}
            maxLength={80}
            autoComplete="postal-address-region"
          />
          <KotakCentang
            label="Saya mau kerja dari rumah"
            dicentang={nilai.openToRemote}
            onUbah={(openToRemote) => ubah({ openToRemote })}
          />
          <PilihanTunggal
            testID="pilihan-pengungkapan"
            judul="Saat melamar, beri tahu perusahaan soal disabilitas saya?"
            opsi={OPSI_PENGUNGKAPAN}
            nilai={nilai.disclosureDefault}
            onUbah={(disclosureDefault) => ubah({ disclosureDefault })}
          />
          <PesanStatus testID="pesan-dasar" pesan={pesan?.teks} galat={pesan?.galat} />
          <Tombol
            testID="tombol-simpan-dasar"
            label="Simpan data dasar"
            sibuk={simpan.isPending}
            onPress={kirim}
          />
        </>
      )}
    </LayarGulir>
  );
}
