// Kontrol PDF CV mobile (PR-092; paritas `KontrolPdf` web, PR-063).
//
// Status diperiksa berkala HANYA selama antre/diproses. Kalimat status baru
// diumumkan setelah pengguna menekan sesuatu: pembukaan layar yang langsung
// berbicara "PDF belum dibuat" adalah gangguan tanpa permintaan.
import { getResumePdfStatus, requestResumePdf, resumesKeys } from "@nawasena/api-client";
import { Tombol } from "@nawasena/ui-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient } from "../api";
import { pesanGalat } from "../auth/alur-masuk";
import { Paragraf, PesanStatus } from "../komponen/Layar";
import { bukaPdfCv, pdfSedangDibuat, pesanStatusPdf } from "./pdf";
import { pdfAndroid } from "./pdf-android";

const INTERVAL_STATUS_MS = 1_500;

export function KontrolPdf(props: { resumeId: string; sub: string | null }) {
  const qc = useQueryClient();
  const kunci = resumesKeys.pdf(props.sub, props.resumeId);
  const [umumkan, setUmumkan] = useState(false);
  const [galatBuka, setGalatBuka] = useState<string>();

  const status = useQuery({
    queryKey: kunci,
    queryFn: () => getResumePdfStatus(apiClient, props.resumeId),
    refetchInterval: (q) => (pdfSedangDibuat(q.state.data) ? INTERVAL_STATUS_MS : false),
  });

  const minta = useMutation({
    mutationFn: () => requestResumePdf(apiClient, props.resumeId),
    onSuccess: (hasil) => qc.setQueryData(kunci, hasil),
  });

  // Status diambil ULANG tepat sebelum membuka: URL presigned berumur pendek,
  // dan URL dari cache bisa sudah kedaluwarsa.
  const buka = useMutation({
    mutationFn: async () => {
      const segar = await getResumePdfStatus(apiClient, props.resumeId);
      qc.setQueryData(kunci, segar);
      if (segar.status !== "ready") return null;
      return bukaPdfCv(pdfAndroid, props.resumeId, segar.downloadUrl);
    },
    onError: (err) => setGalatBuka(pesanGalat(err)),
  });

  const gagalJaringan = status.isError || minta.isError;
  const s = status.data;
  const pesan = pesanStatusPdf(s, gagalJaringan);

  return (
    <>
      {/* Selalu dirender; diumumkan hanya setelah ada tindakan pengguna. */}
      {umumkan ? <PesanStatus testID="status-pdf" pesan={pesan} /> : <Paragraf>{pesan}</Paragraf>}
      <PesanStatus pesan={galatBuka} galat />
      {gagalJaringan ? (
        <Tombol
          label="Coba lagi"
          varian="sekunder"
          onPress={() => {
            setUmumkan(true);
            if (minta.isError) minta.mutate();
            else void status.refetch();
          }}
        />
      ) : s?.status === "ready" ? (
        <>
          <Tombol
            testID="tombol-buka-pdf"
            label="Buka PDF"
            petunjuk="Membuka CV di aplikasi PDF HP Anda"
            sibuk={buka.isPending}
            onPress={() => {
              setUmumkan(true);
              setGalatBuka(undefined);
              buka.mutate();
            }}
          />
          <Tombol
            label="Buat ulang PDF"
            petunjuk="Pakai ini kalau Anda baru mengubah isi CV"
            varian="sekunder"
            sibuk={minta.isPending}
            onPress={() => {
              setUmumkan(true);
              minta.mutate();
            }}
          />
        </>
      ) : (
        <Tombol
          testID="tombol-buat-pdf"
          label="Buat PDF"
          sibuk={minta.isPending || pdfSedangDibuat(s)}
          onPress={() => {
            setUmumkan(true);
            minta.mutate();
          }}
        />
      )}
    </>
  );
}
