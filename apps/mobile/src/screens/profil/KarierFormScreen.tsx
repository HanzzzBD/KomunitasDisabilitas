// Formulir satu item karier (PR-092). Validasi klien = skema server (`periksa`),
// jadi galat per kolom muncul tanpa perjalanan jaringan, dalam kalimat yang sama.
import type { GalatKolom } from "@nawasena/formulir";
import { Masukan, Tombol } from "@nawasena/ui-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiClient } from "../../api";
import { pesanGalat } from "../../auth/alur-masuk";
import { Judul, LayarGulir, Memuat, PesanStatus } from "../../komponen/Layar";
import type { RootStackParamList } from "../../navigation/types";
import { KONFIG_KARIER, type NilaiBaris } from "../../profil/karier";
import { useSub } from "../../query";

type Props = NativeStackScreenProps<RootStackParamList, "KarierForm">;

export function KarierFormScreen({ route, navigation }: Props) {
  const { jenis, id } = route.params;
  const konfig = KONFIG_KARIER[jenis];
  const sub = useSub();
  const qc = useQueryClient();
  // Item lama diambil dari daftar yang sama (sudah ada di cache dari layar sebelumnya).
  const daftar = useQuery({
    queryKey: konfig.kunci(sub),
    queryFn: () => konfig.daftar(apiClient),
    enabled: id !== null,
  });
  const [nilai, setNilai] = useState<NilaiBaris | null>(id === null ? konfig.keNilai(null) : null);
  const [galat, setGalat] = useState<GalatKolom>({});
  const [pesan, setPesan] = useState<string>();

  useEffect(() => {
    if (id === null || nilai !== null || !daftar.data) return;
    const item = (daftar.data as { id: string }[]).find((i) => i.id === id) ?? null;
    setNilai(konfig.keNilai(item));
  }, [id, nilai, daftar.data, konfig]);

  const simpan = useMutation({
    mutationFn: (n: NilaiBaris) => konfig.simpan(apiClient, n, id),
    onSuccess: (hasil) => {
      if (!hasil.ok) {
        setGalat(hasil.galat);
        setPesan("Ada isian yang perlu diperbaiki.");
        return;
      }
      void qc.invalidateQueries({ queryKey: konfig.kunci(sub) });
      // Kembali ke daftar; daftar mengumumkan isinya sendiri saat dimuat ulang.
      navigation.goBack();
    },
    onError: (err) => setPesan(pesanGalat(err)),
  });

  const judul = `${id === null ? "Tambah" : "Ubah"} ${konfig.satuan}`;

  return (
    <LayarGulir testID="layar-karier-form">
      <Judul>{judul}</Judul>
      {nilai === null ? (
        <Memuat label="Memuat data" />
      ) : (
        <>
          {konfig.kolom.map((k) => (
            <Masukan
              key={k.nama}
              testID={`kolom-${k.nama}`}
              label={k.wajib ? `${k.label} (wajib)` : k.label}
              petunjuk={k.bantuan}
              nilai={nilai[k.nama] ?? ""}
              ubahNilai={(v) => setNilai({ ...nilai, [k.nama]: v })}
              galat={galat[k.nama]}
              maxLength={k.maks}
              multiline={k.jenis === "area"}
              keyboardType={k.jenis === "angka" ? "number-pad" : "default"}
            />
          ))}
          <PesanStatus pesan={pesan} galat />
          <Tombol
            testID="tombol-simpan-karier"
            label={`Simpan ${konfig.satuan}`}
            sibuk={simpan.isPending}
            onPress={() => {
              setPesan(undefined);
              simpan.mutate(nilai);
            }}
          />
        </>
      )}
    </LayarGulir>
  );
}
