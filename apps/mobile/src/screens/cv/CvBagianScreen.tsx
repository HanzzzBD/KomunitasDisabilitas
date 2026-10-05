// Satu bagian CV per layar (PR-092). Simpan per bagian: PUT isi CV utuh dengan
// HANYA bagian ini yang diganti — bagian lain diambil dari versi server terkini,
// jadi menyimpan "Keahlian" tidak bisa menimpa "Pengalaman" dengan salinan basi.
import { getResume, resumesKeys, updateResume } from "@nawasena/api-client";
import { periksa, teksMentahAtauNull, type GalatKolom } from "@nawasena/formulir";
import { updateResumeSchema, type ResumeContent } from "@nawasena/schemas";
import { Masukan, Tombol } from "@nawasena/ui-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiClient } from "../../api";
import { pesanGalat } from "../../auth/alur-masuk";
import { DAFTAR_CV, KOLOM_TAUTAN, URUTAN_BAGIAN, type BagianCv } from "../../cv/bagian";
import { DaftarItem } from "../../cv/DaftarItem";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, LayarGulir, Memuat, PesanStatus } from "../../komponen/Layar";
import type { RootStackParamList } from "../../navigation/types";
import { useSub } from "../../query";

type Props = NativeStackScreenProps<RootStackParamList, "CvBagian">;

/** Bagian yang sedang disunting, dalam bentuk isi CV sebagian. */
type Draf = Partial<ResumeContent>;

function drafDari(isi: ResumeContent, bagian: BagianCv): Draf {
  if (bagian === "ringkasan") return { headline: isi.headline, summary: isi.summary };
  if (bagian === "kontak") return { contact: isi.contact };
  return { [bagian]: isi[bagian] };
}

export function CvBagianScreen({ route }: Props) {
  const { id, bagian } = route.params;
  const sub = useSub();
  const qc = useQueryClient();
  const cv = useQuery({
    queryKey: resumesKeys.detail(sub, id),
    queryFn: () => getResume(apiClient, id),
  });
  const [draf, setDraf] = useState<Draf | null>(null);
  const [galat, setGalat] = useState<GalatKolom>({});
  const [pesan, setPesan] = useState<{ teks: string; galat: boolean }>();
  const [umum, setUmum] = useState<string>();

  useEffect(() => {
    if (cv.data && draf === null) setDraf(drafDari(cv.data.content, bagian));
  }, [cv.data, draf, bagian]);

  const simpan = useMutation({
    mutationFn: async (perubahan: Draf) => {
      // Versi server TERKINI sebagai dasar, bukan cache saat layar dibuka.
      const terkini = await getResume(apiClient, id);
      const badan = { content: { ...terkini.content, ...perubahan } };
      const hasil = periksa(updateResumeSchema, badan);
      if (!hasil.ok) return { ok: false as const, galat: hasil.galat };
      return { ok: true as const, cv: await updateResume(apiClient, id, hasil.nilai) };
    },
    onSuccess: (hasil) => {
      if (!hasil.ok) {
        // Path galat diawali `content.` — lepaskan supaya cocok dengan nama kolom.
        setGalat(
          Object.fromEntries(
            Object.entries(hasil.galat).map(([k, v]) => [k.replace(/^content\./, ""), v]),
          ),
        );
        setPesan({ teks: "Ada isian yang perlu diperbaiki.", galat: true });
        return;
      }
      setGalat({});
      qc.setQueryData(resumesKeys.detail(sub, id), hasil.cv);
      void qc.invalidateQueries({ queryKey: resumesKeys.list(sub) });
      setPesan({ teks: "Bagian ini tersimpan. Buat ulang PDF agar ikut berubah.", galat: false });
    },
    onError: (err) => setPesan({ teks: pesanGalat(err), galat: true }),
  });

  const judul = URUTAN_BAGIAN.find((b) => b.bagian === bagian)?.judul ?? "Bagian CV";

  function isi() {
    if (draf === null) return null;
    if (bagian === "ringkasan") {
      return (
        <>
          <Masukan
            label="Headline"
            petunjuk="Satu kalimat tentang Anda. Contoh: Desainer grafis berpengalaman 3 tahun."
            nilai={draf.headline ?? ""}
            ubahNilai={(v) => setDraf({ ...draf, headline: teksMentahAtauNull(v) })}
            galat={galat.headline}
            maxLength={160}
          />
          <Masukan
            label="Ringkasan"
            nilai={draf.summary ?? ""}
            ubahNilai={(v) => setDraf({ ...draf, summary: teksMentahAtauNull(v) })}
            galat={galat.summary}
            maxLength={2000}
            multiline
          />
        </>
      );
    }
    if (bagian === "kontak" && draf.contact) {
      const c = draf.contact;
      const ubah = (sebagian: Partial<typeof c>) =>
        setDraf({ ...draf, contact: { ...c, ...sebagian } });
      return (
        <>
          <Masukan
            label="Email"
            nilai={c.email ?? ""}
            ubahNilai={(v) => ubah({ email: teksMentahAtauNull(v) })}
            galat={galat["contact.email"]}
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
            maxLength={160}
          />
          <Masukan
            label="Nomor HP"
            nilai={c.phone ?? ""}
            ubahNilai={(v) => ubah({ phone: teksMentahAtauNull(v) })}
            galat={galat["contact.phone"]}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={32}
          />
          <Masukan
            label="Kota"
            nilai={c.city ?? ""}
            ubahNilai={(v) => ubah({ city: teksMentahAtauNull(v) })}
            galat={galat["contact.city"]}
            maxLength={80}
          />
          <Masukan
            label="Provinsi"
            nilai={c.province ?? ""}
            ubahNilai={(v) => ubah({ province: teksMentahAtauNull(v) })}
            galat={galat["contact.province"]}
            maxLength={80}
          />
          <Judul tingkat={2}>Tautan (paling banyak 5)</Judul>
          <DaftarItem
            awalanGalat="contact.links"
            satuan="tautan"
            kosong="Belum ada tautan. Contoh: portofolio atau LinkedIn."
            nilai={c.links}
            itemKosong={{ label: "", url: "" }}
            kolom={KOLOM_TAUTAN}
            galat={galat}
            onUbah={(links) => ubah({ links })}
            onUmumkan={setUmum}
            batas={5}
          />
        </>
      );
    }
    if (bagian === "kontak") return null;
    const konfig = DAFTAR_CV[bagian];
    return (
      <DaftarItem
        awalanGalat={bagian}
        satuan={konfig.satuan}
        kosong={konfig.kosong}
        nilai={(draf[bagian] ?? []) as never[]}
        itemKosong={konfig.itemKosong as never}
        kolom={konfig.kolom as never}
        galat={galat}
        onUbah={(v) => setDraf({ ...draf, [bagian]: v })}
        onUmumkan={setUmum}
      />
    );
  }

  return (
    <LayarGulir testID={`layar-cv-bagian-${bagian}`}>
      <Judul>{judul}</Judul>
      {cv.isError ? <GagalMuat galat={cv.error} ulang={() => void cv.refetch()} /> : null}
      {draf === null ? (
        cv.isError ? null : (
          <Memuat label="Memuat CV" />
        )
      ) : (
        <>
          {isi()}
          <PesanStatus pesan={umum} />
          <PesanStatus testID="pesan-cv-bagian" pesan={pesan?.teks} galat={pesan?.galat} />
          <Tombol
            testID="tombol-simpan-bagian"
            label={`Simpan ${judul.toLowerCase()}`}
            sibuk={simpan.isPending}
            onPress={() => {
              setPesan(undefined);
              simpan.mutate(draf);
            }}
          />
        </>
      )}
    </LayarGulir>
  );
}
