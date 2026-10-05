import type { InfiniteData } from "@tanstack/react-query";
import type { Notification, NotificationListResponse } from "@nawasena/schemas";

export type HalamanNotifikasi = InfiniteData<NotificationListResponse>;

export function itemUnik(data: HalamanNotifikasi | undefined): Notification[] {
  const ids = new Set<string>();
  return (data?.pages ?? [])
    .flatMap((p) => p.data)
    .filter((n) => {
      if (ids.has(n.id)) return false;
      ids.add(n.id);
      return true;
    });
}

/** Item tetap ada setelah ditandai, supaya target fokus tidak menghilang. */
export function ubahDibaca(
  data: HalamanNotifikasi | undefined,
  id: string | null,
  at: string,
  jumlah?: number,
): HalamanNotifikasi | undefined {
  if (!data) return data;
  const berubah = itemUnik(data).some((n) => n.readAt === null && (id === null || n.id === id));
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      data: p.data.map((n) =>
        n.readAt === null && (id === null || n.id === id) ? { ...n, readAt: at } : n,
      ),
      meta: {
        ...p.meta,
        unreadCount: jumlah ?? Math.max(0, p.meta.unreadCount - (berubah ? 1 : 0)),
      },
    })),
  };
}

export function gantiItem(
  data: HalamanNotifikasi | undefined,
  item: Notification,
  jumlah: number,
): HalamanNotifikasi | undefined {
  return data
    ? {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          data: p.data.map((n) => (n.id === item.id ? item : n)),
          meta: { ...p.meta, unreadCount: jumlah },
        })),
      }
    : data;
}
