import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsKeys,
} from "@nawasena/api-client";
import { PilihanTunggal, Tombol } from "@nawasena/ui-native";
import { useFocusEffect } from "@react-navigation/native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { apiClient, sesiStore } from "../../api";
import { Judul, LayarGulir, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import { subDariToken } from "../../onboarding/koordinator";
import { createBacaNotifikasi } from "../../notifikasi/baca";
import { useBahasaNotifikasi } from "../../notifikasi/bahasa";
import { itemUnik } from "../../notifikasi/cache";
import { ItemNotifikasi } from "../../notifikasi/ItemNotifikasi";
import { kunciBaca } from "../../notifikasi/kunci";
import { kabarNotifikasi } from "../../notifikasi/instans";
import { galatNotifikasi } from "../../notifikasi/teks";
import { useSub } from "../../query";
import { AktifkanPush } from "../../push/AktifkanPush";

export function NotifikasiScreen() {
  const sub = useSub();
  const versi = useStore(kabarNotifikasi.store, (s) => s.versi);
  const bahasa = useBahasaNotifikasi();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"semua" | "belum">("semua");
  const [pesan, setPesan] = useState<string>();
  const sedangAksi = useRef(false);
  const belum = filter === "belum";
  const daftar = useInfiniteQuery({
    queryKey: notificationsKeys.daftar(sub, belum),
    queryFn: async ({ pageParam, signal }) => {
      const hasil = await listNotifications(
        apiClient,
        { limit: 20, unreadOnly: belum, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      );
      if (
        !signal.aborted &&
        pageParam === undefined &&
        kabarNotifikasi.store.getState().versi === versi &&
        sesiStore.getState().status === "masuk" &&
        subDariToken(sesiStore.getState().accessToken) === sub
      ) {
        qc.setQueryData(notificationsKeys.lencana(sub), hasil.meta.unreadCount);
      }
      return hasil;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.meta.nextCursor ?? undefined,
    enabled: Boolean(sub),
    refetchOnWindowFocus: false,
  });
  const { data: jumlah } = useQuery<number>({
    queryKey: notificationsKeys.lencana(sub),
    enabled: false,
  });
  const { refetch } = daftar;
  useFocusEffect(
    useCallback(() => {
      if (qc.isMutating({ mutationKey: kunciBaca(sub) }) === 0) void refetch();
    }, [refetch, qc, sub]),
  );
  const pembaca = useMemo(
    () =>
      createBacaNotifikasi({
        qc,
        sub: sub ?? "anonim",
        aktif: () =>
          kabarNotifikasi.store.getState().versi === versi &&
          sesiStore.getState().status === "masuk" &&
          subDariToken(sesiStore.getState().accessToken) === sub,
        satu: (id) => markNotificationRead(apiClient, id),
        semua: () => markAllNotificationsRead(apiClient),
      }),
    [qc, sub, versi],
  );
  const aksi = useMutation({
    mutationKey: kunciBaca(sub),
    mutationFn: (id: string | null) => pembaca.jalankan(id),
    onSuccess: (_hasil, id) =>
      setPesan(id === null ? "Notifikasi sudah ditandai dibaca." : "Notifikasi ditandai dibaca."),
    onSettled: () => {
      sedangAksi.current = false;
    },
  });
  function tandai(id: string | null) {
    if (sedangAksi.current || !sub) return;
    sedangAksi.current = true;
    setPesan(undefined);
    aksi.mutate(id);
  }
  const items = itemUnik(daftar.data);
  return (
    <LayarGulir testID="layar-notifikasi">
      <Judul>Notifikasi</Judul>
      <Paragraf>Kabar tentang akun, lamaran, dan CV Anda.</Paragraf>
      <AktifkanPush />
      <PilihanTunggal
        testID="saringan-notifikasi"
        judul="Tampilkan notifikasi"
        nilai={filter}
        onUbah={(nilai) => {
          if (!sedangAksi.current) {
            setFilter(nilai);
            setPesan(undefined);
            aksi.reset();
          }
        }}
        opsi={[
          { nilai: "semua", label: "Semua", nonaktif: aksi.isPending },
          { nilai: "belum", label: "Belum dibaca", nonaktif: aksi.isPending },
        ]}
      />
      <Tombol
        label="Tandai semua dibaca"
        testID="tandai-semua-notifikasi"
        varian="sekunder"
        sibuk={aksi.isPending && aksi.variables === null}
        nonaktif={jumlah === undefined || jumlah === 0 || aksi.isPending}
        onPress={() => tandai(null)}
      />
      <Tombol
        label="Muat ulang notifikasi"
        varian="sekunder"
        sibuk={daftar.isRefetching}
        nonaktif={aksi.isPending}
        onPress={() => void refetch()}
      />
      <PesanStatus pesan={pesan} />
      <PesanStatus galat pesan={aksi.isError ? galatNotifikasi(aksi.error) : undefined} />
      {jumlah === undefined ? null : (
        <Paragraf>
          {jumlah} notifikasi belum dibaca. {items.length} notifikasi dimuat.
        </Paragraf>
      )}
      {daftar.isPending ? <Memuat label="Memuat notifikasi" /> : null}
      {daftar.isError ? <PesanStatus galat pesan={galatNotifikasi(daftar.error)} /> : null}
      {daftar.isSuccess && items.length === 0 ? (
        <Paragraf>
          {belum
            ? "Semua notifikasi Anda sudah dibaca."
            : "Belum ada notifikasi. Kabar baru akan tampil di sini."}
        </Paragraf>
      ) : null}
      {belum && items.some((n) => n.readAt !== null) ? (
        <Paragraf>
          Notifikasi yang baru dibaca tetap tampil sampai Anda memuat ulang daftar.
        </Paragraf>
      ) : null}
      {items.map((item) => (
        <ItemNotifikasi
          key={item.id}
          item={item}
          bahasa={bahasa}
          sibuk={aksi.isPending}
          tandai={() => tandai(item.id)}
        />
      ))}
      {daftar.hasNextPage ? (
        <Tombol
          label="Muat notifikasi berikutnya"
          sibuk={daftar.isFetchingNextPage}
          nonaktif={aksi.isPending}
          onPress={() => void daftar.fetchNextPage()}
        />
      ) : null}
    </LayarGulir>
  );
}
