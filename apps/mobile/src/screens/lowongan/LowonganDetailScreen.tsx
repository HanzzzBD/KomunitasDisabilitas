// Detail lowongan (PR-093; paritas `DetailLowongan` web, PR-059 + PR-087).
//
// Urutan judul = urutan keputusan melamar: judul lowongan → ringkasan →
// deskripsi → persyaratan → akomodasi → terbuka untuk → tentang perusahaan →
// cara melamar. Tiap bagian berjudul (accessibilityRole="header") supaya
// TalkBack bisa melompat antarbagian lewat navigasi judul.
//
// Teks lowongan dirender sebagai TEKS biasa; RN tidak menafsirkan HTML.
import { companiesKeys, getCompanyPublic, getJobPublic, jobsKeys } from "@nawasena/api-client";
import { UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { apiClient } from "../../api";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, LayarGulir, Memuat, Paragraf } from "../../komponen/Layar";
import { BagianLamar } from "../../lamaran/BagianLamar";
import { TeksSederhanakan } from "../../lowongan/TeksSederhanakan";
import { TEKS_INKLUSIF, teksGaji, teksLokasi, teksMode, teksTipe } from "../../lowongan/teks";
import type { RootStackParamList } from "../../navigation/types";
import { LABEL_AKOMODASI, LABEL_RAGAM } from "../../profil/label";

type Props = NativeStackScreenProps<RootStackParamList, "LowonganDetail">;

const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

/** Satu baris ringkasan: satu elemen TalkBack "Cara kerja: Kerja dari rumah". */
function Baris({ label, nilai }: { label: string; nilai: string }) {
  const { warna, skalaTeks } = useTokenA11y();
  return (
    <View accessible accessibilityLabel={`${label}: ${nilai}`} style={{ paddingVertical: 4 }}>
      <Text style={{ color: warna.teksLemah, fontSize: UKURAN_HURUF.label * skalaTeks }}>
        {label}
      </Text>
      <Text
        style={{ color: warna.teks, fontSize: UKURAN_HURUF.isi * skalaTeks, fontWeight: "600" }}
      >
        {nilai}
      </Text>
    </View>
  );
}

function Daftar({ butir }: { butir: readonly string[] }): ReactNode {
  return butir.map((b) => <Paragraf key={b}>• {b}</Paragraf>);
}

export function LowonganDetailScreen({ route }: Props) {
  const { id } = route.params;
  const { warna } = useTokenA11y();
  const lowongan = useQuery({
    queryKey: jobsKeys.detail(id),
    queryFn: () => getJobPublic(apiClient, id),
  });
  const companyId = lowongan.data?.companyId;
  const perusahaan = useQuery({
    queryKey: companiesKeys.public(companyId ?? ""),
    queryFn: () => getCompanyPublic(apiClient, companyId ?? ""),
    enabled: companyId !== undefined,
  });

  if (lowongan.isError) {
    return (
      <LayarGulir testID="layar-lowongan-detail">
        <GagalMuat galat={lowongan.error} ulang={() => void lowongan.refetch()} />
      </LayarGulir>
    );
  }
  if (!lowongan.data) {
    return (
      <LayarGulir testID="layar-lowongan-detail">
        <Memuat label="Memuat lowongan" />
      </LayarGulir>
    );
  }

  const j = lowongan.data;
  const p = perusahaan.data;
  const lokasi = teksLokasi(j);
  const gaji = teksGaji(j.salaryMin, j.salaryMax);

  return (
    <LayarGulir testID="layar-lowongan-detail">
      <Judul>{j.title}</Judul>
      {p ? <Paragraf tebal>{p.name}</Paragraf> : null}

      <Judul tingkat={2}>Ringkasan</Judul>
      <View style={{ borderWidth: 1, borderColor: warna.garis, borderRadius: 8, padding: 12 }}>
        <Baris label="Jenis kerja" nilai={teksTipe(j.employmentType)} />
        <Baris label="Cara kerja" nilai={teksMode(j.workMode)} />
        {lokasi ? <Baris label="Lokasi" nilai={lokasi} /> : null}
        {gaji ? <Baris label="Gaji" nilai={gaji} /> : null}
        {j.expiresAt ? (
          <Baris label="Lamaran ditutup" nilai={TANGGAL.format(new Date(j.expiresAt))} />
        ) : null}
      </View>

      <Judul tingkat={2}>Deskripsi pekerjaan</Judul>
      <TeksSederhanakan
        jobId={j.id}
        bagian="deskripsi"
        namaBagian="Deskripsi pekerjaan"
        teksAsli={j.description}
      />

      {j.requirements ? (
        <>
          <Judul tingkat={2}>Persyaratan</Judul>
          <TeksSederhanakan
            jobId={j.id}
            bagian="persyaratan"
            namaBagian="Persyaratan"
            teksAsli={j.requirements}
          />
        </>
      ) : null}

      <Judul tingkat={2}>Dukungan yang tersedia</Judul>
      {j.accommodations.length === 0 ? (
        <Paragraf>Perusahaan belum menulis dukungan untuk lowongan ini.</Paragraf>
      ) : (
        <Daftar butir={j.accommodations.map((a) => LABEL_AKOMODASI[a])} />
      )}

      {j.welcomedDisabilityTypes.length > 0 ? (
        <>
          <Judul tingkat={2}>Terbuka untuk</Judul>
          <Daftar butir={j.welcomedDisabilityTypes.map((r) => LABEL_RAGAM[r])} />
        </>
      ) : null}

      <Judul tingkat={2}>Tentang perusahaan</Judul>
      {perusahaan.isError ? (
        <GagalMuat galat={perusahaan.error} ulang={() => void perusahaan.refetch()} />
      ) : !p ? (
        <Memuat label="Memuat data perusahaan" />
      ) : (
        <View style={{ gap: 8 }}>
          <Paragraf tebal>{p.name}</Paragraf>
          {/* Status verifikasi: teks, bukan warna lencana saja. */}
          <View
            accessible
            accessibilityLabel={`Status: ${TEKS_INKLUSIF[p.inclusivityStatus].label}. ${TEKS_INKLUSIF[p.inclusivityStatus].penjelasan}`}
          >
            <Paragraf tebal>Status: {TEKS_INKLUSIF[p.inclusivityStatus].label}</Paragraf>
            <Paragraf lemah>{TEKS_INKLUSIF[p.inclusivityStatus].penjelasan}</Paragraf>
          </View>
          {p.city ? <Paragraf>Kota: {p.city}</Paragraf> : null}
          {p.description ? <Paragraf>{p.description}</Paragraf> : null}
          {p.accommodationsAvailable.length > 0 ? (
            <>
              <Judul tingkat={2}>Dukungan di perusahaan ini</Judul>
              <Daftar butir={p.accommodationsAvailable.map((a) => LABEL_AKOMODASI[a])} />
            </>
          ) : null}
        </View>
      )}

      <BagianLamar key={j.id} jobId={j.id} judul={j.title} />
    </LayarGulir>
  );
}
