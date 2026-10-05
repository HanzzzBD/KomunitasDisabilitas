import { dataUntukDiungkap, type PilihanUngkap } from "@nawasena/formulir";
import type { SeekerProfile } from "@nawasena/schemas";
import { PilihanTunggal, Tombol } from "@nawasena/ui-native";
import type { UseQueryResult } from "@tanstack/react-query";

import { GagalMuat } from "../komponen/GagalMuat";
import { Judul, Memuat, Paragraf } from "../komponen/Layar";
import { LABEL_AKOMODASI, LABEL_RAGAM } from "../profil/label";

export function PilihanDisclosure(props: {
  profil: UseQueryResult<SeekerProfile>;
  ungkap: PilihanUngkap | null;
  onUbah: (v: PilihanUngkap) => void;
  sibuk: boolean;
  onProfil: () => void;
}) {
  const data = dataUntukDiungkap(props.profil.data);
  return (
    <>
      <Judul tingkat={2}>Data disabilitas dan akomodasi</Judul>
      <Paragraf>
        Keputusan ini hanya berlaku untuk lamaran ini. CV tetap dikirim pada kedua pilihan. Periksa
        juga isi CV Anda.
      </Paragraf>
      {props.profil.isPending ? (
        <Memuat label="Memuat pratinjau data disabilitas" />
      ) : props.profil.isError ? (
        <GagalMuat galat={props.profil.error} ulang={() => void props.profil.refetch()} />
      ) : data ? (
        <>
          <Paragraf tebal>Data yang ikut dikirim jika memilih Ya:</Paragraf>
          {data.disabilityTypes.map((r) => (
            <Paragraf key={r}>• {LABEL_RAGAM[r]}</Paragraf>
          ))}
          {data.accommodationNeeds.tags.map((a) => (
            <Paragraf key={a}>• {LABEL_AKOMODASI[a]}</Paragraf>
          ))}
          {data.accommodationNeeds.notes ? (
            <Paragraf>{data.accommodationNeeds.notes}</Paragraf>
          ) : null}
        </>
      ) : (
        <Paragraf>
          Belum ada data yang bisa diungkap. Pilih Tidak atau isi profil terlebih dahulu.
        </Paragraf>
      )}
      <PilihanTunggal<PilihanUngkap>
        judul="Kirim data disabilitas kepada perusahaan?"
        nilai={props.ungkap}
        testID="pilihan-ungkap"
        onUbah={props.onUbah}
        opsi={[
          {
            nilai: "tidak",
            label: "Tidak, tanpa data disabilitas",
            bantuan: "Data disabilitas dan akomodasi dari profil tidak ikut dikirim.",
            nonaktif: props.sibuk,
          },
          {
            nilai: "ya",
            label: "Ya, sertakan data disabilitas",
            bantuan: "Salinan data pada pratinjau ikut dikirim kepada perusahaan.",
            nonaktif:
              props.sibuk || data === null || props.profil.isError || props.profil.isFetching,
          },
        ]}
      />
      {!data ? (
        <Tombol
          label="Isi data di Profil"
          varian="sekunder"
          nonaktif={props.sibuk}
          onPress={() => {
            props.onProfil();
          }}
        />
      ) : null}
    </>
  );
}
