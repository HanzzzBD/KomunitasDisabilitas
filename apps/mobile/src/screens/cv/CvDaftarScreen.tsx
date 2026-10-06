// Tab CV (PR-092): daftar CV + "Buat CV dari profil".
//
import { deleteResume, listResumes, resumesKeys } from "@nawasena/api-client";
import { Dialog, Kartu, Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";

import { apiClient } from "../../api";
import { pesanGalat } from "../../auth/alur-masuk";
import { useBuatCvDariProfil } from "../../cv/use-buat-cv";
import { KontrolPdf } from "../../cv/KontrolPdf";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, LayarGulir, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import type { RootStackParamList } from "../../navigation/types";
import { useSub } from "../../query";

const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export function CvDaftarScreen() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const sub = useSub();
  const qc = useQueryClient();
  const { warna, skalaTeks } = useTokenA11y();
  const daftar = useQuery({
    queryKey: resumesKeys.list(sub),
    queryFn: () => listResumes(apiClient),
  });
  const [pesan, setPesan] = useState<{ teks: string; galat: boolean }>();
  const [akanDihapus, setAkanDihapus] = useState<{ id: string; judul: string } | null>(null);

  const buat = useBuatCvDariProfil(sub, (r) => nav.navigate("CvEditor", { id: r.id }));
  const hapus = useMutation({
    mutationFn: (v: { id: string; judul: string }) => deleteResume(apiClient, v.id),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: resumesKeys.list(sub) });
      setPesan({ teks: `${v.judul} sudah dihapus.`, galat: false });
    },
    onError: (err) => setPesan({ teks: pesanGalat(err), galat: true }),
  });

  return (
    <LayarGulir testID="layar-cv">
      <Judul>CV saya</Judul>
      <Paragraf>
        Buat CV lewat percakapan dengan AI atau dari profil Anda. Periksa isinya, lalu buat PDF.
      </Paragraf>
      <Tombol label="Buat CV dengan AI" onPress={() => nav.navigate("CvChat")} />
      <Tombol
        testID="tombol-buat-cv"
        varian="sekunder"
        label={buat.isPending ? "Sebentar, CV sedang dibuat" : "Buat CV dari profil"}
        sibuk={buat.isPending}
        onPress={() => {
          setPesan(undefined);
          buat.mutate(undefined, {
            onError: (err) => setPesan({ teks: pesanGalat(err), galat: true }),
          });
        }}
      />
      <PesanStatus pesan={pesan?.teks} galat={pesan?.galat} />
      {daftar.isError ? (
        <GagalMuat galat={daftar.error} ulang={() => void daftar.refetch()} />
      ) : null}
      {daftar.isPending ? <Memuat label="Memuat daftar CV" /> : null}
      {daftar.data?.length === 0 ? <Paragraf>Anda belum punya CV.</Paragraf> : null}
      {daftar.data?.map((cv) => (
        <Kartu key={cv.id} testID={`cv-${cv.id}`}>
          <Text
            style={{ color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks, fontWeight: "700" }}
          >
            {cv.title}
          </Text>
          <Text style={{ color: warna.teksLemah, fontSize: UKURAN_HURUF.label * skalaTeks }}>
            Diubah {TANGGAL.format(new Date(cv.updatedAt))}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Tombol
              label={`Buka CV: ${cv.title}`}
              onPress={() => nav.navigate("CvEditor", { id: cv.id })}
            />
            <Tombol
              label={`Hapus CV: ${cv.title}`}
              varian="bahaya"
              onPress={() => setAkanDihapus({ id: cv.id, judul: cv.title })}
            />
          </View>
          <KontrolPdf resumeId={cv.id} sub={sub} />
        </Kartu>
      ))}
      <Dialog
        testID="dialog-hapus-cv"
        terbuka={akanDihapus !== null}
        tutup={() => setAkanDihapus(null)}
        judul="Hapus CV ini?"
        deskripsi={
          akanDihapus ? `${akanDihapus.judul} akan dihapus. Ini tidak bisa dibatalkan.` : undefined
        }
        labelTutup="Batal"
      >
        <Tombol
          testID="tombol-hapus-cv-yakin"
          label="Ya, hapus CV"
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
