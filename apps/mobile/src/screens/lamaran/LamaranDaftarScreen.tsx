import { applicationsKeys, listMyApplications } from "@nawasena/api-client";
import { Kartu, Tombol } from "@nawasena/ui-native";
import { useFocusEffect, useNavigation, type NavigationProp } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { apiClient } from "../../api";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, LayarGulir, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import { STATUS, TANGGAL } from "../../lamaran/teks";
import type { RootStackParamList } from "../../navigation/types";
import { useSub } from "../../query";
import { AktifkanPush } from "../../push/AktifkanPush";

export function LamaranDaftarScreen() {
  const sub = useSub();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const daftar = useInfiniteQuery({
    queryKey: applicationsKeys.myList(sub),
    queryFn: ({ pageParam }) =>
      listMyApplications(apiClient, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.meta.nextCursor ?? undefined,
  });
  const { refetch } = daftar;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const semua = daftar.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <LayarGulir testID="layar-lamaran">
      <Judul>Lamaran saya</Judul>
      <Paragraf>Lihat perkembangan setiap lamaran Anda.</Paragraf>
      <AktifkanPush />
      <Tombol
        label="Muat ulang lamaran"
        varian="sekunder"
        sibuk={daftar.isRefetching}
        onPress={() => void daftar.refetch()}
      />
      <PesanStatus pesan={daftar.data ? `${semua.length} lamaran sudah dimuat.` : undefined} />
      {daftar.isPending ? <Memuat label="Memuat lamaran" /> : null}
      {daftar.isError ? (
        <GagalMuat galat={daftar.error} ulang={() => void daftar.refetch()} />
      ) : null}
      {daftar.isSuccess && semua.length === 0 ? (
        <>
          <Paragraf>Anda belum melamar. Temukan lowongan yang cocok di Cari.</Paragraf>
          <Tombol label="Cari lowongan" onPress={() => nav.navigate("Utama", { screen: "Cari" })} />
        </>
      ) : null}
      {semua.map((a) => {
        const judul = a.job?.title ?? "Lowongan tidak tersedia";
        return (
          <Kartu
            key={a.id}
            testID={`lamaran-${a.id}`}
            label={`${judul}. ${a.job?.companyName ?? ""}. Status ${STATUS[a.status]}. Dilamar ${TANGGAL.format(new Date(a.appliedAt))}.`}
            petunjuk="Buka perkembangan lamaran"
            onPress={() => nav.navigate("LamaranDetail", { id: a.id })}
          >
            <Paragraf tebal>{judul}</Paragraf>
            {a.job ? <Paragraf>{a.job.companyName}</Paragraf> : null}
            <Paragraf>Status: {STATUS[a.status]}</Paragraf>
            <Paragraf lemah>Dilamar {TANGGAL.format(new Date(a.appliedAt))}</Paragraf>
            {a.job?.aktif === false ? (
              <Paragraf lemah>Lowongan sudah ditutup. Lamaran tetap tercatat.</Paragraf>
            ) : null}
          </Kartu>
        );
      })}
      {daftar.hasNextPage ? (
        <Tombol
          label="Muat lamaran berikutnya"
          sibuk={daftar.isFetchingNextPage}
          onPress={() => void daftar.fetchNextPage()}
        />
      ) : null}
    </LayarGulir>
  );
}
