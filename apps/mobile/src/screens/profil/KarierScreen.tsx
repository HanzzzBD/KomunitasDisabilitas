// Daftar karier profil — pengalaman / pendidikan / keahlian (PR-092).
// Tiap item: kartu dengan tombol Ubah & Hapus bernama lengkap ("Hapus
// pengalaman: Desainer"), sehingga TalkBack tidak membacakan lima "Hapus" kembar.
import { Dialog, Kartu, Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";

import { apiClient } from "../../api";
import { pesanGalat } from "../../auth/alur-masuk";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, LayarGulir, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import type { RootStackParamList } from "../../navigation/types";
import { KONFIG_KARIER } from "../../profil/karier";
import { useSub } from "../../query";

type Props = NativeStackScreenProps<RootStackParamList, "Karier">;

export function KarierScreen({ route, navigation }: Props) {
  const konfig = KONFIG_KARIER[route.params.jenis];
  const sub = useSub();
  const qc = useQueryClient();
  const { warna, skalaTeks } = useTokenA11y();
  const daftar = useQuery({ queryKey: konfig.kunci(sub), queryFn: () => konfig.daftar(apiClient) });
  const [akanDihapus, setAkanDihapus] = useState<{ id: string; judul: string } | null>(null);
  const [pesan, setPesan] = useState<{ teks: string; galat: boolean }>();

  const hapus = useMutation({
    mutationFn: (v: { id: string; judul: string }) => konfig.hapus(apiClient, v.id),
    onSuccess: (_, v) => {
      qc.setQueryData(konfig.kunci(sub), (lama: { id: string }[] | undefined) =>
        lama?.filter((i) => i.id !== v.id),
      );
      setPesan({ teks: `${v.judul} sudah dihapus.`, galat: false });
    },
    onError: (err) => setPesan({ teks: pesanGalat(err), galat: true }),
  });

  return (
    <LayarGulir testID={`layar-karier-${konfig.jenis}`}>
      <Judul>{konfig.judul}</Judul>
      <Tombol
        testID="tombol-tambah-karier"
        label={`Tambah ${konfig.satuan}`}
        onPress={() => navigation.navigate("KarierForm", { jenis: konfig.jenis, id: null })}
      />
      <PesanStatus pesan={pesan?.teks} galat={pesan?.galat} />
      {daftar.isError ? (
        <GagalMuat galat={daftar.error} ulang={() => void daftar.refetch()} />
      ) : null}
      {daftar.isPending ? <Memuat label={`Memuat ${konfig.judul.toLowerCase()}`} /> : null}
      {daftar.data?.length === 0 ? <Paragraf>{konfig.kosong}</Paragraf> : null}
      {daftar.data?.map((item: { id: string }) => {
        const { judul, keterangan } = konfig.ringkas(item);
        return (
          <Kartu key={item.id} testID={`karier-${item.id}`}>
            <Text
              style={{
                color: warna.teks,
                fontSize: UKURAN_HURUF.isi * skalaTeks,
                fontWeight: "700",
              }}
            >
              {judul}
            </Text>
            {keterangan ? (
              <Text style={{ color: warna.teksLemah, fontSize: UKURAN_HURUF.label * skalaTeks }}>
                {keterangan}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Tombol
                label={`Ubah ${konfig.satuan}: ${judul}`}
                varian="sekunder"
                onPress={() =>
                  navigation.navigate("KarierForm", { jenis: konfig.jenis, id: item.id })
                }
              />
              <Tombol
                label={`Hapus ${konfig.satuan}: ${judul}`}
                varian="bahaya"
                onPress={() => setAkanDihapus({ id: item.id, judul })}
              />
            </View>
          </Kartu>
        );
      })}
      <Dialog
        testID="dialog-hapus-karier"
        terbuka={akanDihapus !== null}
        tutup={() => setAkanDihapus(null)}
        judul={`Hapus ${konfig.satuan} ini?`}
        deskripsi={akanDihapus?.judul}
        labelTutup="Batal"
      >
        <Tombol
          testID="tombol-hapus-yakin"
          label="Ya, hapus"
          varian="bahaya"
          onPress={() => {
            if (akanDihapus) hapus.mutate(akanDihapus);
            setAkanDihapus(null);
          }}
        />
      </Dialog>
    </LayarGulir>
  );
}
