import { listNotifications, notificationsKeys } from "@nawasena/api-client";
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useStore } from "zustand";
import { apiClient } from "../api";
import { useSub } from "../query";
import { kabarNotifikasi } from "./instans";
import { kunciBaca, kunciTerbaru } from "./kunci";

/** Satu poll 20 item saat foreground, untuk count + kabar tanpa FCM sekalipun. */
export function PantauNotifikasi() {
  const sub = useSub();
  const aktif = useStore(kabarNotifikasi.store, (s) => s.aktif && s.siap);
  const sedangBaca = useIsMutating({ mutationKey: kunciBaca(sub) }) > 0;
  const qc = useQueryClient();
  const terbaru = useQuery({
    queryKey: kunciTerbaru(sub),
    queryFn: ({ signal }) => listNotifications(apiClient, { limit: 20 }, signal),
    enabled: Boolean(sub) && aktif && !sedangBaca,
    staleTime: 0,
    refetchInterval: aktif && !sedangBaca ? 30_000 : false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!sub || !aktif || sedangBaca || kabarNotifikasi.store.getState().sub !== sub) return;
    if (terbaru.isError) {
      kabarNotifikasi.gagal();
      return;
    }
    // Cache sebelum resume bukan baseline baru: tunggu hasil segar, agar
    // kabar background tidak diulang sebagai banner foreground.
    if (terbaru.isFetching || terbaru.fetchStatus !== "idle") return;
    if (terbaru.data) {
      qc.setQueryData(notificationsKeys.lencana(sub), terbaru.data.meta.unreadCount);
      kabarNotifikasi.sinkron(terbaru.data.data);
    }
  }, [
    terbaru.data,
    terbaru.dataUpdatedAt,
    terbaru.isError,
    terbaru.isFetching,
    terbaru.fetchStatus,
    sub,
    aktif,
    sedangBaca,
    qc,
  ]);
  return null;
}
