// Bagian data disabilitas + akomodasi (PR-092; paritas `BagianSensitif` web).
//
// Consent paritas web (AC PR-092):
// - BELUM berizin → penjelasan + kotak izin yang TIDAK PERNAH tercentang di
//   awal; kolom baru muncul setelah dicentang; consent dikirim BERSAMA data.
// - SUDAH berizin → tanggal persetujuan terlihat (bukti UU PDP), kolom terbuka,
//   dan "Cabut izin" dengan konfirmasi: mencabut MENGHAPUS data di server.
// Tidak ada salinan lokal selain cache memori TanStack yang dibuang saat keluar.
import { getProfile, profilesKeys, updateProfile } from "@nawasena/api-client";
import {
  alihkan,
  BADAN_CABUT,
  keBadanSensitif,
  keNilaiSensitif,
  periksa,
  SENSITIF_KOSONG,
  type GalatKolom,
  type NilaiSensitif,
} from "@nawasena/formulir";
import {
  ACCOMMODATION_NEEDS,
  DISABILITY_TYPES,
  updateSeekerProfileSchema,
  type UpdateSeekerProfile,
} from "@nawasena/schemas";
import { Dialog, KotakCentang, Masukan, Tombol } from "@nawasena/ui-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { View } from "react-native";

import { apiClient } from "../../api";
import { pesanGalat } from "../../auth/alur-masuk";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, LayarGulir, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import { LABEL_AKOMODASI, LABEL_RAGAM } from "../../profil/label";
import { useSub } from "../../query";

const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export function ProfilSensitifScreen() {
  const sub = useSub();
  const qc = useQueryClient();
  const profil = useQuery({ queryKey: profilesKeys.me(sub), queryFn: () => getProfile(apiClient) });
  const [nilai, setNilai] = useState<NilaiSensitif | null>(null);
  const [galat, setGalat] = useState<GalatKolom>({});
  const [pesan, setPesan] = useState<{ teks: string; galat: boolean }>();
  const [dialogCabut, setDialogCabut] = useState(false);
  const tombolCabut = useRef<View>(null);

  useEffect(() => {
    if (profil.data && nilai === null) setNilai(keNilaiSensitif(profil.data));
  }, [profil.data, nilai]);

  const berizinSejak = profil.data?.consentSensitiveAt ?? null;
  const sudahBerizin = berizinSejak !== null;

  const simpan = useMutation({
    mutationFn: (v: { badan: UpdateSeekerProfile; cabut: boolean }) =>
      updateProfile(apiClient, v.badan),
    onSuccess: (baru, v) => {
      qc.setQueryData(profilesKeys.me(sub), baru);
      setNilai(keNilaiSensitif(baru));
      setPesan({
        teks: v.cabut
          ? "Izin dicabut. Data disabilitas Anda sudah kami hapus."
          : "Data disabilitas tersimpan.",
        galat: false,
      });
    },
    onError: (err) => setPesan({ teks: pesanGalat(err), galat: true }),
  });

  function kirim() {
    if (nilai === null) return;
    setPesan(undefined);
    const hasil = periksa(updateSeekerProfileSchema, keBadanSensitif(nilai, sudahBerizin));
    if (!hasil.ok) {
      setGalat(hasil.galat);
      setPesan({ teks: "Ada isian yang perlu diperbaiki.", galat: true });
      return;
    }
    setGalat({});
    simpan.mutate({ badan: hasil.nilai, cabut: false });
  }

  const kolomTampak = nilai !== null && (sudahBerizin || nilai.setuju);

  return (
    <LayarGulir testID="layar-profil-sensitif">
      <Judul>Disabilitas dan akomodasi</Judul>
      <Paragraf>
        Data ini membantu kami mencarikan tempat kerja yang siap mendukung Anda. Data ini sangat
        pribadi, jadi kami simpan dengan aman (terenkripsi).
      </Paragraf>
      <Paragraf tebal>
        Perusahaan hanya melihatnya kalau Anda pilih untuk memberi tahu saat melamar.
      </Paragraf>
      {profil.isError ? (
        <GagalMuat galat={profil.error} ulang={() => void profil.refetch()} />
      ) : null}
      {nilai === null ? (
        profil.isError ? null : (
          <Memuat label="Memuat profil" />
        )
      ) : (
        <>
          {sudahBerizin ? (
            <Paragraf>Anda memberi izin pada {TANGGAL.format(new Date(berizinSejak))}.</Paragraf>
          ) : (
            <>
              <Paragraf>
                Anda belum memberi izin. Tanpa izin, kami tidak menyimpan data ini.
              </Paragraf>
              <KotakCentang
                testID="kotak-izin-sensitif"
                label="Saya izinkan Nawasena menyimpan data disabilitas saya"
                bantuan="Kotak ini kosong. Anda sendiri yang harus mencentangnya."
                dicentang={nilai.setuju}
                onUbah={(dicentang) =>
                  setNilai(dicentang ? { ...nilai, setuju: true } : { ...SENSITIF_KOSONG })
                }
              />
            </>
          )}

          {kolomTampak ? (
            <>
              <Judul tingkat={2}>Kondisi Anda (boleh lebih dari satu)</Judul>
              {DISABILITY_TYPES.map((r) => (
                <KotakCentang
                  key={r}
                  testID={`ragam-profil-${r}`}
                  label={LABEL_RAGAM[r]}
                  dicentang={nilai.ragam.includes(r)}
                  onUbah={(d) => setNilai({ ...nilai, ragam: alihkan(nilai.ragam, r, d) })}
                />
              ))}
              <Judul tingkat={2}>Dukungan yang Anda butuhkan</Judul>
              {ACCOMMODATION_NEEDS.map((a) => (
                <KotakCentang
                  key={a}
                  testID={`akomodasi-${a}`}
                  label={LABEL_AKOMODASI[a]}
                  dicentang={nilai.akomodasi.includes(a)}
                  onUbah={(d) => setNilai({ ...nilai, akomodasi: alihkan(nilai.akomodasi, a, d) })}
                />
              ))}
              <Masukan
                label="Catatan dukungan lain"
                petunjuk="Boleh dikosongkan. Paling banyak 500 huruf."
                nilai={nilai.catatan}
                ubahNilai={(catatan) => setNilai({ ...nilai, catatan })}
                galat={galat["accommodationNeeds.notes"]}
                maxLength={500}
                multiline
              />
            </>
          ) : null}

          <PesanStatus testID="pesan-sensitif" pesan={pesan?.teks} galat={pesan?.galat} />

          {kolomTampak ? (
            <Tombol
              testID="tombol-simpan-sensitif"
              label="Simpan data disabilitas"
              sibuk={simpan.isPending && !dialogCabut}
              onPress={kirim}
            />
          ) : null}
          {sudahBerizin ? (
            <Tombol
              ref={tombolCabut}
              testID="tombol-cabut-izin"
              label="Cabut izin dan hapus data"
              varian="bahaya"
              onPress={() => setDialogCabut(true)}
            />
          ) : null}
          <Dialog
            testID="dialog-cabut"
            terbuka={dialogCabut}
            tutup={() => setDialogCabut(false)}
            judul="Cabut izin?"
            deskripsi="Data disabilitas dan akomodasi Anda akan kami hapus. Anda bisa mengisinya lagi nanti."
            labelTutup="Batal"
            pemicu={tombolCabut}
          >
            <Tombol
              testID="tombol-cabut-yakin"
              label="Ya, cabut dan hapus"
              varian="bahaya"
              onPress={() => {
                setDialogCabut(false);
                setPesan(undefined);
                simpan.mutate({ badan: BADAN_CABUT, cabut: true });
              }}
            />
          </Dialog>
        </>
      )}
    </LayarGulir>
  );
}
