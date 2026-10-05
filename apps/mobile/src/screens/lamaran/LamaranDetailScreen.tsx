import {
  ApiError,
  applicationsKeys,
  confirmHiredMyApplication,
  getMyApplication,
  withdrawMyApplication,
} from "@nawasena/api-client";
import { petakanLiniMasa } from "@nawasena/formulir";
import { statusLamaranAktif } from "@nawasena/schemas";
import { Dialog, Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Text, View } from "react-native";

import { apiClient } from "../../api";
import { sekaliSaja, track } from "../../analitik/instans";
import { Judul, LayarGulir, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import { ARTI_STATUS, pesanGalatLamaran, STATUS, TANGGAL, WAKTU } from "../../lamaran/teks";
import type { RootStackParamList } from "../../navigation/types";
import { useSub } from "../../query";

type Props = NativeStackScreenProps<RootStackParamList, "LamaranDetail">;

export function LamaranDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const sub = useSub();
  const qc = useQueryClient();
  const { warna, skalaTeks } = useTokenA11y();
  const [tarikTerbuka, setTarikTerbuka] = useState(false);
  const tombolTarik = useRef<View>(null);
  const judulSelamat = useRef<Text>(null);
  const statusRef = useRef<Text>(null);
  const sedangMutasi = useRef(false);
  const [baruKonfirmasi, setBaruKonfirmasi] = useState(false);
  const lamaran = useQuery({
    queryKey: applicationsKeys.myDetail(sub, id),
    queryFn: () => getMyApplication(apiClient, id),
    retry: (n, e) => !(e instanceof ApiError && e.code === "LAMARAN_TIDAK_DITEMUKAN") && n < 1,
  });
  const { refetch } = lamaran;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const aksi = useMutation({
    mutationFn: (jenis: "tarik" | "konfirmasi") =>
      jenis === "tarik"
        ? withdrawMyApplication(apiClient, id)
        : confirmHiredMyApplication(apiClient, id),
    onSuccess: (hasil, jenis) => {
      qc.setQueryData(applicationsKeys.myDetail(sub, id), hasil);
      void qc.invalidateQueries({ queryKey: ["my-applications"] });
      if (jenis === "konfirmasi") {
        track("hired_confirmed");
        setBaruKonfirmasi(true);
      } else setTarikTerbuka(false);
    },
    onError: () => {
      void refetch();
    },
    onSettled: () => {
      sedangMutasi.current = false;
    },
  });
  const a = lamaran.data;
  const tahap = a?.status;
  useEffect(() => {
    if (tahap && ["interview", "offered", "hired"].includes(tahap)) {
      void sekaliSaja(`wawancara.${id}`, () => track("wawancara"));
    }
  }, [tahap, id]);
  useEffect(() => {
    if (baruKonfirmasi && a?.hiredConfirmedAt && judulSelamat.current) {
      AccessibilityInfo.sendAccessibilityEvent(judulSelamat.current, "focus");
    }
  }, [baruKonfirmasi, a?.hiredConfirmedAt]);
  function lakukan(jenis: "tarik" | "konfirmasi") {
    if (sedangMutasi.current) return;
    sedangMutasi.current = true;
    aksi.mutate(jenis);
  }
  return (
    <LayarGulir testID="layar-lamaran-detail">
      <PesanStatus
        testID={`status-lamaran-${a?.id ?? "memuat"}`}
        pesan={a ? `Status terbaru: ${STATUS[a.status]}.` : undefined}
      />
      {lamaran.isPending ? <Memuat label="Memuat perkembangan lamaran" /> : null}
      {lamaran.isError ? (
        <>
          <PesanStatus pesan={pesanGalatLamaran(lamaran.error)} galat />
          <Tombol label="Muat ulang lamaran" onPress={() => void refetch()} />
        </>
      ) : a ? (
        <>
          <Judul>{a.job?.title ?? "Lowongan tidak tersedia"}</Judul>
          {a.job ? <Paragraf>{a.job.companyName}</Paragraf> : null}
          <Paragraf>Dilamar {TANGGAL.format(new Date(a.appliedAt))}</Paragraf>
          {a.job?.aktif ? (
            <Tombol
              label="Lihat lowongan"
              varian="sekunder"
              onPress={() => navigation.navigate("LowonganDetail", { id: a.jobId })}
            />
          ) : (
            <Paragraf lemah>Lowongan sudah ditutup. Lamaran Anda tetap tercatat.</Paragraf>
          )}
          <Text
            ref={statusRef}
            accessibilityRole="header"
            style={{
              color: warna.teks,
              fontSize: (UKURAN_HURUF.isi + 2) * skalaTeks,
              fontWeight: "700",
            }}
          >
            Status sekarang: {STATUS[a.status]}
          </Text>
          <Paragraf>{ARTI_STATUS[a.status]}</Paragraf>
          <Paragraf>
            {a.discloseDisability
              ? "Salinan data disabilitas dan akomodasi ikut dikirim saat melamar."
              : "Data disabilitas dan akomodasi dari profil tidak ikut dikirim."}
          </Paragraf>
          <PesanStatus pesan={aksi.isError ? pesanGalatLamaran(aksi.error) : undefined} galat />
          {statusLamaranAktif(a.status) ? (
            <Tombol
              ref={tombolTarik}
              testID="tombol-tarik-lamaran"
              label="Tarik lamaran"
              varian="bahaya"
              nonaktif={aksi.isPending}
              onPress={() => {
                aksi.reset();
                setTarikTerbuka(true);
              }}
            />
          ) : null}
          {a.hiredConfirmedAt ? (
            <>
              <Text
                ref={judulSelamat}
                accessibilityRole="header"
                style={{
                  color: warna.teks,
                  fontSize: UKURAN_HURUF.judul * skalaTeks,
                  fontWeight: "700",
                }}
              >
                Selamat, Anda diterima bekerja!
              </Text>
              <Paragraf>
                Konfirmasi Anda tercatat pada {TANGGAL.format(new Date(a.hiredConfirmedAt))}.
              </Paragraf>
            </>
          ) : a.status === "offered" || a.status === "hired" ? (
            <>
              <Judul tingkat={2}>Sudah diterima bekerja?</Judul>
              <Paragraf>
                Tekan tombol ini jika Anda sudah menerima pekerjaan dari perusahaan ini.
              </Paragraf>
              <Tombol
                testID="tombol-konfirmasi-diterima"
                label="Saya diterima"
                sibuk={aksi.isPending}
                onPress={() => lakukan("konfirmasi")}
              />
            </>
          ) : null}
          <Judul tingkat={2}>Riwayat lamaran</Judul>
          {petakanLiniMasa(a).map((e, i, semua) => (
            <View
              key={`${e.at}-${e.status ?? "awal"}`}
              accessible
              accessibilityLabel={`${i + 1} dari ${semua.length}. ${e.status ? STATUS[e.status] : "Lamaran dikirim"}. ${WAKTU.format(new Date(e.at))}.${e.terbaru ? " Status terbaru." : ""}${e.oleh ? (e.oleh === "seeker" ? " Oleh Anda." : " Oleh tim Nawasena.") : ""}`}
            >
              <Paragraf tebal>
                {i + 1}. {e.status ? STATUS[e.status] : "Lamaran dikirim"}
                {e.terbaru ? " — Status terbaru" : ""}
              </Paragraf>
              <Paragraf lemah>{WAKTU.format(new Date(e.at))}</Paragraf>
            </View>
          ))}
          <Tombol
            label="Muat ulang status"
            varian="sekunder"
            sibuk={lamaran.isRefetching}
            onPress={() => void refetch()}
          />
          <Dialog
            terbuka={tarikTerbuka}
            tutup={() => {
              if (!aksi.isPending) setTarikTerbuka(false);
            }}
            testID="dialog-tarik-lamaran"
            judul="Tarik lamaran ini?"
            labelTutup="Batal"
            deskripsi="Lamaran tidak akan dilanjutkan. Anda tidak dapat melamar ulang lowongan yang sama."
            pemicu={a.status === "withdrawn" ? statusRef : tombolTarik}
          >
            <PesanStatus pesan={aksi.isError ? pesanGalatLamaran(aksi.error) : undefined} galat />
            <Tombol
              label="Ya, tarik lamaran"
              varian="bahaya"
              sibuk={aksi.isPending}
              onPress={() => lakukan("tarik")}
            />
          </Dialog>
        </>
      ) : null}
    </LayarGulir>
  );
}
