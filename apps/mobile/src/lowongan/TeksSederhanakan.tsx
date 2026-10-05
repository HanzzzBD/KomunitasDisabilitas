// "Sederhanakan" satu bagian teks lowongan (PR-093; paritas `TeksSederhanakan`
// web, PR-087).
//
// - SATU tombol, labelnya berganti ("Buat teks ini lebih mudah dibaca" →
//   "Lihat teks dari perusahaan" ⇄ "Lihat lagi versi yang mudah dibaca"),
//   jadi fokus TalkBack tetap di tempatnya saat isi di bawahnya berganti.
// - Hasil disimpan di state: bolak-balik TIDAK meminta ulang (tiap permintaan
//   memotong satu jatah).
// - Degradasi = tombol hilang + penjelasan sesuai `alasan` server; teks asli
//   tetap tampil.
// - Hasil AI dirender sebagai TEKS biasa — RN tidak menafsirkan HTML.
import { simplifyText } from "@nawasena/api-client";
import type { AiSimplifyAlasanDegradasi, AiSimplifyBagianLowongan } from "@nawasena/schemas";
import { Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";

import { apiClient } from "../api";
import { Paragraf, PesanStatus } from "../komponen/Layar";

const TEKS_DEGRADASI: Readonly<Record<AiSimplifyAlasanDegradasi, string>> = {
  kuota_habis:
    "Jatah AI hari ini sudah habis. Coba lagi besok. Teks dari perusahaan tetap ada di bawah.",
  ai_tidak_tersedia:
    "AI belum bisa menulis ulang teks ini. Teks dari perusahaan tetap ada di bawah.",
  dimatikan: "Fitur ini sedang tidak dipakai. Teks dari perusahaan tetap ada di bawah.",
};

export interface TeksSederhanakanProps {
  jobId: string;
  bagian: AiSimplifyBagianLowongan;
  /** Nama bagian untuk pengumuman ("Deskripsi pekerjaan"). */
  namaBagian: string;
  teksAsli: string;
}

export function TeksSederhanakan({ jobId, bagian, namaBagian, teksAsli }: TeksSederhanakanProps) {
  const { warna, skalaTeks } = useTokenA11y();
  const [sederhana, setSederhana] = useState<string | null>(null);
  const [tampilSederhana, setTampilSederhana] = useState(false);
  const [degradasi, setDegradasi] = useState<AiSimplifyAlasanDegradasi | null>(null);
  const [pengumuman, setPengumuman] = useState<string>();

  const minta = useMutation({
    mutationFn: () => simplifyText(apiClient, { sumber: "lowongan", id: jobId, bagian }),
    onSuccess: (hasil) => {
      if (hasil.teks === null) {
        setDegradasi(hasil.alasan);
        return;
      }
      setSederhana(hasil.teks);
      setTampilSederhana(true);
      setPengumuman(`${namaBagian}: sekarang tampil versi yang mudah dibaca.`);
    },
  });

  const tampil = tampilSederhana && sederhana !== null;
  const gayaTeks = { color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks };

  return (
    <View style={{ gap: 8 }}>
      <PesanStatus pesan={pengumuman} />
      {degradasi !== null ? (
        <PesanStatus pesan={TEKS_DEGRADASI[degradasi]} />
      ) : sederhana === null ? (
        <>
          <Tombol
            testID={`sederhanakan-${bagian}`}
            label={
              minta.isPending
                ? "Sebentar, AI sedang menulis ulang"
                : "Buat teks ini lebih mudah dibaca"
            }
            petunjuk="AI menulis ulang teks ini dengan kalimat pendek. Memakai satu jatah AI harian."
            varian="sekunder"
            sibuk={minta.isPending}
            onPress={() => minta.mutate()}
          />
          {minta.isError ? (
            <PesanStatus galat pesan="Gagal terkirim. Cek internet Anda, lalu coba lagi." />
          ) : null}
        </>
      ) : (
        <Tombol
          testID={`alih-sederhana-${bagian}`}
          label={tampil ? "Lihat teks dari perusahaan" : "Lihat lagi versi yang mudah dibaca"}
          varian="sekunder"
          onPress={() => {
            const berikut = !tampilSederhana;
            setTampilSederhana(berikut);
            setPengumuman(
              berikut
                ? `${namaBagian}: sekarang tampil versi yang mudah dibaca.`
                : `${namaBagian}: sekarang tampil teks dari perusahaan.`,
            );
          }}
        />
      )}
      {tampil ? (
        <View style={{ gap: 4, borderLeftWidth: 4, borderColor: warna.teks, paddingLeft: 12 }}>
          <Paragraf tebal>
            AI menulis ulang teks ini. Teks dari perusahaan tetap yang resmi.
          </Paragraf>
          <Text style={gayaTeks}>{sederhana}</Text>
        </View>
      ) : (
        <Text style={gayaTeks}>{teksAsli}</Text>
      )}
    </View>
  );
}
