// Editor CV mobile (PR-092): judul + daftar bagian (satu bagian per layar) + PDF.
import { getResume, resumesKeys, updateResume } from "@nawasena/api-client";
import { periksa, type GalatKolom } from "@nawasena/formulir";
import { updateResumeSchema } from "@nawasena/schemas";
import { Kartu, Masukan, Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { apiClient } from "../../api";
import { pesanGalat } from "../../auth/alur-masuk";
import { ringkasBagian, URUTAN_BAGIAN } from "../../cv/bagian";
import { KontrolPdf } from "../../cv/KontrolPdf";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, LayarGulir, Memuat, PesanStatus } from "../../komponen/Layar";
import type { RootStackParamList } from "../../navigation/types";
import { useSub } from "../../query";

type Props = NativeStackScreenProps<RootStackParamList, "CvEditor">;

export function CvEditorScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const sub = useSub();
  const qc = useQueryClient();
  const { warna, skalaTeks } = useTokenA11y();
  const cv = useQuery({
    queryKey: resumesKeys.detail(sub, id),
    queryFn: () => getResume(apiClient, id),
  });
  const [judul, setJudul] = useState<string | null>(null);
  const [galat, setGalat] = useState<GalatKolom>({});
  const [pesan, setPesan] = useState<{ teks: string; galat: boolean }>();

  useEffect(() => {
    if (cv.data && judul === null) setJudul(cv.data.title);
  }, [cv.data, judul]);

  const simpanJudul = useMutation({
    mutationFn: (title: string) => updateResume(apiClient, id, { title }),
    onSuccess: (baru) => {
      qc.setQueryData(resumesKeys.detail(sub, id), baru);
      void qc.invalidateQueries({ queryKey: resumesKeys.list(sub) });
      setPesan({ teks: "Judul CV tersimpan.", galat: false });
    },
    onError: (err) => setPesan({ teks: pesanGalat(err), galat: true }),
  });

  return (
    <LayarGulir testID="layar-cv-editor">
      <Judul>Ubah CV</Judul>
      {cv.isError ? <GagalMuat galat={cv.error} ulang={() => void cv.refetch()} /> : null}
      {!cv.data || judul === null ? (
        cv.isError ? null : (
          <Memuat label="Memuat CV" />
        )
      ) : (
        <>
          <Masukan
            testID="masukan-judul-cv"
            label="Judul CV (wajib)"
            petunjuk="Hanya untuk Anda. Contoh: CV untuk kerja kantor."
            nilai={judul}
            ubahNilai={setJudul}
            galat={galat.title}
            maxLength={120}
          />
          <PesanStatus pesan={pesan?.teks} galat={pesan?.galat} />
          <Tombol
            label="Simpan judul"
            varian="sekunder"
            sibuk={simpanJudul.isPending}
            onPress={() => {
              setPesan(undefined);
              const hasil = periksa(updateResumeSchema, { title: judul });
              if (!hasil.ok) return setGalat(hasil.galat);
              setGalat({});
              simpanJudul.mutate(judul);
            }}
          />

          <Judul tingkat={2}>Isi CV</Judul>
          {URUTAN_BAGIAN.map(({ bagian, judul: judulBagian }) => {
            const ringkas = ringkasBagian(cv.data.content, bagian);
            return (
              <Kartu
                key={bagian}
                testID={`cv-bagian-${bagian}`}
                label={`${judulBagian}: ${ringkas}`}
                petunjuk="Buka untuk mengubah bagian ini"
                onPress={() => navigation.navigate("CvBagian", { id, bagian })}
              >
                <Text
                  style={{
                    color: warna.teks,
                    fontSize: UKURAN_HURUF.isi * skalaTeks,
                    fontWeight: "700",
                  }}
                >
                  {judulBagian}
                </Text>
                <Text style={{ color: warna.teksLemah, fontSize: UKURAN_HURUF.label * skalaTeks }}>
                  {ringkas}
                </Text>
              </Kartu>
            );
          })}

          <Judul tingkat={2}>PDF</Judul>
          <KontrolPdf resumeId={id} sub={sub} />
        </>
      )}
    </LayarGulir>
  );
}
