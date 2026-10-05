// Tab Beranda = feed AI Job Matching (PR-093; paritas `FeedMatching` web, PR-074).
//
// Paritas perilaku yang dibawa dari web:
// - TIDAK ADA YANG BERUBAH SENDIRI: saat re-rank AI masih berjalan, layar hanya
//   memberi tahu dan menawarkan "Lihat urutan yang baru". Kartu yang berpindah
//   tempat tanpa diminta mengganggu pengguna autisme dan pembaca layar.
// - Banner degradasi saat AI tidak dipakai — daftar tetap diurutkan skor.
// - Refresh berkuota punya tombol yang tetap bisa dicapai saat jatah habis,
//   dengan alasannya.
// - Tarik-untuk-muat-ulang ADA, tetapi selalu berpasangan dengan tombol "Muat
//   ulang daftar" (AC PR-093): gerakan saja tidak terjangkau sebagian pengguna.
// - "Muat lebih banyak" berupa tombol, bukan gulir tak berujung (CLAUDE.md §5.2).
//
// Posisi daftar pulih saat kembali dari detail tanpa kode khusus: detail
// didorong ke stack root DI ATAS tab, jadi layar ini tidak pernah dilepas.
import { listMatches, matchingKeys, refreshMatches } from "@nawasena/api-client";
import type { MatchesResponse } from "@nawasena/schemas";
import { Tombol, useTokenA11y } from "@nawasena/ui-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { apiClient } from "../../api";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import { KartuLowongan } from "../../lowongan/KartuLowongan";
import type { RootStackParamList } from "../../navigation/types";
import { useSub } from "../../query";

export const PER_HALAMAN_FEED = 20;

export function FeedScreen() {
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const sub = useSub();
  const qc = useQueryClient();
  const { warna } = useTokenA11y();
  const kunci = matchingKeys.feed(sub);
  const [pengumuman, setPengumuman] = useState<string>();

  const daftar = useInfiniteQuery({
    queryKey: kunci,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listMatches(apiClient, {
        limit: PER_HALAMAN_FEED,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (terakhir: MatchesResponse) => terakhir.meta.nextCursor ?? undefined,
  });

  /** Ganti seluruh daftar dengan satu halaman pertama yang baru. */
  const ganti = (halaman: MatchesResponse) =>
    qc.setQueryData<InfiniteData<MatchesResponse, string | undefined>>(kunci, {
      pages: [halaman],
      pageParams: [undefined],
    });

  const segarkan = useMutation({
    mutationFn: () => refreshMatches(apiClient, { limit: PER_HALAMAN_FEED }),
    onSuccess: (h) => {
      ganti(h);
      setPengumuman("Daftar sudah diperbarui.");
    },
    onError: () =>
      setPengumuman("Daftar tidak bisa diperbarui. Daftar lama masih bisa Anda lihat."),
  });

  const terbaru = useMutation({
    mutationFn: () => listMatches(apiClient, { limit: PER_HALAMAN_FEED }),
    onSuccess: (h) => {
      ganti(h);
      setPengumuman("Urutan terbaru sudah ditampilkan.");
    },
  });

  const halaman = daftar.data?.pages ?? [];
  const meta = halaman[0]?.meta;
  const item = halaman.flatMap((h) => h.data);
  const sisa = meta?.sisaRefresh ?? 0;

  const kepala = (
    <View style={{ gap: 16, paddingBottom: 8 }}>
      <Judul>Lowongan untuk Anda</Judul>
      <PesanStatus pesan={pengumuman} />
      {meta?.aiMenyusun === true ? (
        <View
          style={{ gap: 8, borderWidth: 1, borderColor: warna.garis, borderRadius: 8, padding: 12 }}
        >
          <Paragraf>
            AI sedang menyusun daftar ini. Sementara itu, kami tampilkan urutan biasa.
          </Paragraf>
          <Tombol
            label="Lihat urutan yang baru"
            varian="sekunder"
            sibuk={terbaru.isPending}
            onPress={() => terbaru.mutate()}
          />
        </View>
      ) : null}
      {meta?.degraded === true ? (
        <View
          testID="banner-degradasi"
          accessible
          style={{ borderWidth: 1, borderColor: warna.garis, borderRadius: 8, padding: 12 }}
        >
          <Paragraf>
            AI sedang tidak bisa dipakai. Daftar ini tetap diurutkan dari yang paling cocok.
          </Paragraf>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Tombol
          testID="tombol-muat-ulang"
          label="Muat ulang daftar"
          varian="sekunder"
          sibuk={daftar.isRefetching && !daftar.isFetchingNextPage}
          onPress={() => void daftar.refetch()}
        />
        <Tombol
          testID="tombol-perbarui-rekomendasi"
          label="Perbarui rekomendasi"
          // Tetap bisa dicapai saat habis — alasannya dibaca sebagai petunjuk.
          petunjuk={
            sisa === 0
              ? "Hari ini daftar tidak bisa diperbarui lagi. Coba lagi besok."
              : `Hari ini masih bisa diperbarui ${String(sisa)} kali.`
          }
          nonaktif={meta === undefined || sisa === 0}
          sibuk={segarkan.isPending}
          onPress={() => segarkan.mutate()}
        />
      </View>
      {meta !== undefined ? (
        <Paragraf lemah>
          {sisa === 0
            ? "Hari ini daftar tidak bisa diperbarui lagi. Coba lagi besok."
            : `Hari ini masih bisa diperbarui ${String(sisa)} kali.`}
        </Paragraf>
      ) : null}
      {daftar.isError ? (
        <GagalMuat galat={daftar.error} ulang={() => void daftar.refetch()} />
      ) : null}
      {daftar.isPending ? <Memuat label="Memuat lowongan untuk Anda" /> : null}
      {daftar.isSuccess && item.length === 0 ? (
        meta?.alasanKosong === "profil-belum-siap" ? (
          <>
            <Judul tingkat={2}>Isi profil Anda dulu</Judul>
            <Paragraf>
              Kami perlu tahu keahlian dan pengalaman Anda untuk mencarikan lowongan.
            </Paragraf>
            <Tombol
              label="Isi profil"
              onPress={() => nav.navigate("Utama", { screen: "Profil" })}
            />
          </>
        ) : (
          <>
            <Judul tingkat={2}>Belum ada lowongan yang cocok untuk Anda</Judul>
            <Paragraf>
              Nanti akan ada lowongan baru. Anda juga bisa mencari lowongan sendiri.
            </Paragraf>
          </>
        )
      ) : null}
    </View>
  );

  return (
    <FlatList
      testID="layar-feed"
      style={{ backgroundColor: warna.latar }}
      contentContainerStyle={{ padding: 24, gap: 12 }}
      data={item}
      keyExtractor={(m) => m.job.id}
      ListHeaderComponent={kepala}
      renderItem={({ item: m }) => (
        <KartuLowongan
          job={m.job}
          cocok={m}
          onBuka={() => nav.navigate("LowonganDetail", { id: m.job.id })}
        />
      )}
      ListFooterComponent={
        <View style={{ gap: 12, paddingTop: 8 }}>
          {daftar.hasNextPage ? (
            <Tombol
              testID="tombol-muat-lagi"
              label="Muat lebih banyak lowongan"
              varian="sekunder"
              sibuk={daftar.isFetchingNextPage}
              onPress={() => void daftar.fetchNextPage()}
            />
          ) : null}
          <Tombol
            label="Cari lowongan lain"
            varian="sekunder"
            onPress={() => nav.navigate("Utama", { screen: "Cari" })}
          />
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={daftar.isRefetching && !daftar.isFetchingNextPage}
          onRefresh={() => void daftar.refetch()}
          colors={[warna.teks]}
        />
      }
    />
  );
}
