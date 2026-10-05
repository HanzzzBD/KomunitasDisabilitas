import { notificationsKeys } from "@nawasena/api-client";
import type { NotificationReadAllResponse, NotificationReadResponse } from "@nawasena/schemas";
import type { QueryClient } from "@tanstack/react-query";
import { gantiItem, itemUnik, ubahDibaca, type HalamanNotifikasi } from "./cache";
import { kunciDaftar, kunciTerbaru } from "./kunci";

/** Satu aksi berjalan; logout membatalkan hak menulis hasil maupun rollback. */
export function createBacaNotifikasi(deps: {
  qc: QueryClient;
  sub: string;
  aktif: () => boolean;
  satu: (id: string) => Promise<NotificationReadResponse>;
  semua: () => Promise<NotificationReadAllResponse>;
  sekarang?: () => string;
}) {
  let berjalan: Promise<void> | null = null;
  async function kerja(id: string | null) {
    const { qc, sub } = deps;
    const kunci = kunciDaftar(sub);
    const badge = notificationsKeys.lencana(sub);
    await Promise.all(
      [...kunci, badge, kunciTerbaru(sub)].map((queryKey) => qc.cancelQueries({ queryKey })),
    );
    if (!deps.aktif()) return;
    const sebelum = kunci.map((key) => qc.getQueryData<HalamanNotifikasi>(key));
    const jumlahLama = qc.getQueryData<number>(badge);
    const at = deps.sekarang?.() ?? new Date().toISOString();
    if (id !== null) {
      const belum = sebelum.some((data) =>
        itemUnik(data).some((n) => n.id === id && n.readAt === null),
      );
      kunci.forEach((key, i) =>
        qc.setQueryData<HalamanNotifikasi>(key, ubahDibaca(sebelum[i], id, at)),
      );
      if (belum && jumlahLama !== undefined) qc.setQueryData(badge, Math.max(0, jumlahLama - 1));
    }
    try {
      if (id === null) {
        const hasil = await deps.semua();
        if (!deps.aktif()) return;
        kunci.forEach((key) =>
          qc.setQueryData<HalamanNotifikasi>(key, (data) =>
            ubahDibaca(data, null, at, hasil.meta.unreadCount),
          ),
        );
        qc.setQueryData(badge, hasil.meta.unreadCount);
      } else {
        const hasil = await deps.satu(id);
        if (!deps.aktif()) return;
        kunci.forEach((key) =>
          qc.setQueryData<HalamanNotifikasi>(key, (data) =>
            gantiItem(data, hasil.data, hasil.meta.unreadCount),
          ),
        );
        qc.setQueryData(badge, hasil.meta.unreadCount);
      }
    } catch (err) {
      if (deps.aktif() && id !== null) {
        kunci.forEach((key, i) => qc.setQueryData<HalamanNotifikasi>(key, sebelum[i]));
        if (jumlahLama !== undefined) qc.setQueryData(badge, jumlahLama);
      }
      throw err;
    } finally {
      if (deps.aktif()) {
        kunci.forEach((queryKey) => {
          void qc.invalidateQueries({ queryKey, refetchType: "none" });
        });
        void qc.invalidateQueries({ queryKey: kunciTerbaru(sub) });
      }
    }
  }
  return {
    jalankan(id: string | null): Promise<void> {
      if (berjalan) return berjalan;
      const janji = kerja(id).finally(() => {
        berjalan = null;
      });
      berjalan = janji;
      return janji;
    },
  };
}
