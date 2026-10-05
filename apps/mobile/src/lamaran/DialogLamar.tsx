import {
  ApiError,
  applyJob,
  getProfile,
  listResumes,
  profilesKeys,
  resumesKeys,
} from "@nawasena/api-client";
import { cvBawaan, dataUntukDiungkap, periksaIsian, type PilihanUngkap } from "@nawasena/formulir";
import type { Application } from "@nawasena/schemas";
import { Dialog, PilihanTunggal, Tombol } from "@nawasena/ui-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { View } from "react-native";

import { apiClient } from "../api";
import { useBuatCvDariProfil } from "../cv/use-buat-cv";
import { GagalMuat } from "../komponen/GagalMuat";
import { Memuat, Paragraf, PesanStatus } from "../komponen/Layar";
import type { RootStackParamList } from "../navigation/types";
import { PilihanDisclosure } from "./PilihanDisclosure";
import { useSub } from "../query";
import { pesanGalatLamaran, TANGGAL } from "./teks";

interface Props {
  jobId: string;
  judul: string;
  tutup: () => void;
  selesai: (lamaran: Application) => void;
  sudahAda: () => void;
  pemicu: RefObject<View | null>;
  terbuka: boolean;
}

export function DialogLamar(props: Props) {
  const sibuk = useRef(false);
  return (
    <Dialog
      terbuka={props.terbuka}
      tutup={() => {
        if (!sibuk.current) props.tutup();
      }}
      pemicu={props.pemicu}
      testID="dialog-lamar"
      judul={`Lamar: ${props.judul}`}
      labelTutup="Batal"
    >
      {props.terbuka ? (
        <IsiLamar
          {...props}
          onSibuk={(nilai) => {
            sibuk.current = nilai;
          }}
        />
      ) : null}
    </Dialog>
  );
}

function IsiLamar(props: Props & { onSibuk: (nilai: boolean) => void }) {
  const { onSibuk } = props;
  const sub = useSub();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const [cvPilihan, setCvPilihan] = useState<string | null>(null);
  // Disclosure selalu kosong: keputusan owner PR-078, bukan disclosureDefault profil.
  const [ungkap, setUngkap] = useState<PilihanUngkap | null>(null);
  const [galat, setGalat] = useState<string>();
  const [kunci] = useState(randomUUID);
  const sedangKirim = useRef(false);
  const profil = useQuery({
    queryKey: profilesKeys.me(sub),
    queryFn: () => getProfile(apiClient),
    staleTime: 0,
  });
  const daftar = useQuery({
    queryKey: resumesKeys.list(sub),
    queryFn: () => listResumes(apiClient),
    staleTime: 0,
  });
  const cvId = cvPilihan ?? cvBawaan(daftar.data ?? []);
  const data = dataUntukDiungkap(profil.data);
  const buat = useBuatCvDariProfil(sub, (cv) => setCvPilihan(cv.id));
  const kirim = useMutation({
    mutationFn: (input: Parameters<typeof applyJob>[2]) =>
      applyJob(apiClient, props.jobId, input, kunci),
    onSuccess: props.selesai,
    onError: (err) => {
      if (err instanceof ApiError && err.code === "SUDAH_MELAMAR") props.sudahAda();
      else setGalat(pesanGalatLamaran(err));
    },
    onSettled: () => {
      sedangKirim.current = false;
    },
  });
  const sibuk = kirim.isPending || buat.isPending;
  useEffect(() => {
    onSibuk(sibuk);
  }, [sibuk, onSibuk]);
  function kirimLamaran() {
    if (sedangKirim.current || sibuk) return;
    const hasil = periksaIsian(
      { resumeId: cvId, ungkap },
      data !== null && !profil.isError && !profil.isFetching,
    );
    if (!hasil.ok) {
      setGalat(
        hasil.galat.cv
          ? "Pilih CV terlebih dahulu."
          : hasil.galat.ungkap === "lowongan.lamar.galat.ungkapTakBisa"
            ? "Data pada pratinjau belum siap. Muat ulang profil atau pilih Tidak."
            : "Pilih Ya atau Tidak untuk pengungkapan data disabilitas.",
      );
      return;
    }
    setGalat(undefined);
    sedangKirim.current = true;
    props.onSibuk(true);
    kirim.mutate(hasil.input);
  }
  return (
    <>
      <PesanStatus pesan={galat} galat testID="galat-lamar" />
      {daftar.isPending ? (
        <Memuat label="Memuat CV" />
      ) : daftar.isError ? (
        <GagalMuat galat={daftar.error} ulang={() => void daftar.refetch()} />
      ) : daftar.data.length === 0 ? (
        <>
          <Paragraf>
            Anda perlu CV untuk melamar. Buat dari profil, lalu lanjutkan di dialog ini.
          </Paragraf>
          <Tombol
            label="Buat CV dari profil"
            sibuk={buat.isPending}
            onPress={() =>
              buat.mutate(undefined, {
                onError: (err) => setGalat(pesanGalatLamaran(err)),
              })
            }
          />
        </>
      ) : (
        <PilihanTunggal
          judul="CV yang dikirim"
          nilai={cvId}
          testID="pilihan-cv"
          opsi={daftar.data.map((cv) => ({
            nilai: cv.id,
            label: cv.title,
            bantuan: `Diubah ${TANGGAL.format(new Date(cv.updatedAt))}`,
            nonaktif: sibuk,
          }))}
          onUbah={setCvPilihan}
        />
      )}
      {cvId ? (
        <Tombol
          label="Periksa atau ubah CV sebelum melamar"
          varian="sekunder"
          nonaktif={sibuk}
          onPress={() => {
            props.tutup();
            nav.navigate("CvEditor", { id: cvId });
          }}
        />
      ) : null}
      <PilihanDisclosure
        profil={profil}
        ungkap={ungkap}
        onUbah={setUngkap}
        sibuk={sibuk}
        onProfil={() => {
          props.tutup();
          nav.navigate("ProfilSensitif");
        }}
      />
      <Tombol
        testID="tombol-kirim-lamaran"
        label={kirim.isPending ? "Mengirim lamaran" : "Kirim lamaran"}
        sibuk={kirim.isPending}
        nonaktif={daftar.isPending || daftar.isError || buat.isPending}
        onPress={kirimLamaran}
      />
    </>
  );
}
