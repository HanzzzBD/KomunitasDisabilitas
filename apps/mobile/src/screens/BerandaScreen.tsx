import {
  applicationsKeys,
  getMe,
  getProfile,
  listMatches,
  listMyApplications,
  listResumes,
  matchingKeys,
  profilesKeys,
  resumesKeys,
  usersKeys,
} from "@nawasena/api-client";
import { Tombol } from "@nawasena/ui-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api";
import { Judul, LayarGulir, Memuat, Paragraf } from "../komponen/Layar";
import { GagalMuat } from "../komponen/GagalMuat";
import { KartuLowongan } from "../lowongan/KartuLowongan";
import { feedMatchingAktif } from "../lowongan/teks";
import { STATUS } from "../lamaran/teks";
import { useSub } from "../query";
import type { RootStackParamList } from "../navigation/types";

export function BerandaScreen() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const sub = useSub();
  const akun = useQuery({ queryKey: usersKeys.me(), queryFn: () => getMe(apiClient) });
  const profil = useQuery({ queryKey: profilesKeys.me(sub), queryFn: () => getProfile(apiClient) });
  const cv = useQuery({ queryKey: resumesKeys.list(sub), queryFn: () => listResumes(apiClient) });
  const lamaran = useQuery({
    queryKey: [...applicationsKeys.myList(sub), "ringkasan"],
    queryFn: () => listMyApplications(apiClient, { limit: 3 }),
  });
  // Home uses a distinct key: a limited preview cannot truncate the full feed cache.
  const rekomendasi = useQuery({
    queryKey: [...matchingKeys.feed(sub), "ringkasan"],
    queryFn: () => listMatches(apiClient, { limit: 3 }),
    enabled: feedMatchingAktif,
  });
  const terisi = profil.data
    ? [profil.data.headline, profil.data.summary, profil.data.city, profil.data.province].filter(
        (v) => v?.trim(),
      ).length
    : null;
  return (
    <LayarGulir testID="layar-beranda">
      <Judul>Beranda</Judul>
      <Paragraf tebal>{`Halo, ${akun.data?.data.fullName || "selamat datang"}.`}</Paragraf>
      <Judul tingkat={2}>Profil dasar Anda</Judul>
      {profil.isError && <GagalMuat galat={profil.error} ulang={() => void profil.refetch()} />}
      <Paragraf>
        {terisi === null
          ? profil.isPending
            ? "Memuat ringkasan profil."
            : "Ringkasan profil belum tersedia."
          : `${terisi} dari 4 bagian terisi: judul profil, ringkasan, kota, dan provinsi.`}
      </Paragraf>
      <Tombol label="Lengkapi profil" onPress={() => nav.navigate("Utama", { screen: "Profil" })} />
      <Judul tingkat={2}>CV Saya</Judul>
      {cv.isError && <GagalMuat galat={cv.error} ulang={() => void cv.refetch()} />}
      <Paragraf>
        {cv.data
          ? `Anda punya ${cv.data.length} CV.`
          : cv.isPending
            ? "Memuat ringkasan CV."
            : "Ringkasan CV belum tersedia."}
      </Paragraf>
      <Tombol
        label="Siapkan CV saya"
        varian="sekunder"
        onPress={() => nav.navigate("Utama", { screen: "Cv" })}
      />
      <Judul tingkat={2}>Lamaran terbaru</Judul>
      {lamaran.isPending && <Memuat label="Memuat lamaran terbaru" />}
      {lamaran.isError && <GagalMuat galat={lamaran.error} ulang={() => void lamaran.refetch()} />}
      {lamaran.data?.data.length === 0 && (
        <Paragraf>Anda belum melamar. Cari pekerjaan di Lowongan.</Paragraf>
      )}
      {lamaran.data?.data.slice(0, 3).map((a) => (
        <Tombol
          key={a.id}
          label={`${a.job?.title ?? "Detail lamaran"}, ${STATUS[a.status]}`}
          varian="sekunder"
          onPress={() =>
            nav.navigate("Utama", {
              screen: "Lamaran",
              params: { screen: "LamaranDetail", params: { id: a.id }, initial: false },
            })
          }
        />
      ))}
      <Tombol
        label="Lihat semua lamaran"
        varian="sekunder"
        onPress={() => nav.navigate("Utama", { screen: "Lamaran" })}
      />
      {feedMatchingAktif && (
        <>
          <Judul tingkat={2}>Rekomendasi pekerjaan</Judul>
          {rekomendasi.isPending && <Memuat label="Memuat rekomendasi pekerjaan" />}
          {rekomendasi.isError && (
            <GagalMuat galat={rekomendasi.error} ulang={() => void rekomendasi.refetch()} />
          )}
          {rekomendasi.data?.data.length === 0 && (
            <Paragraf>Belum ada rekomendasi. Anda bisa mencari pekerjaan di Lowongan.</Paragraf>
          )}
          {rekomendasi.data?.data
            .slice(0, 3)
            .map((m) => (
              <KartuLowongan
                key={m.job.id}
                job={m.job}
                cocok={m}
                onBuka={() => nav.navigate("LowonganDetail", { id: m.job.id })}
              />
            ))}
          <Tombol
            label="Lihat semua rekomendasi"
            varian="sekunder"
            onPress={() => nav.navigate("Rekomendasi")}
          />
        </>
      )}
      <Tombol label="Cari lowongan" onPress={() => nav.navigate("Utama", { screen: "Cari" })} />
    </LayarGulir>
  );
}
