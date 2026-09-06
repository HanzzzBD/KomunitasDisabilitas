// Endpoint preferensi kanal notifikasi (PR-049b).
//
// Bentuknya meniru `accessibility.ts` sampai ke detail terkecil, dan itu
// disengaja: keduanya preferensi milik pemilik sesi, keduanya memakai `null`
// untuk "belum pernah memilih", dan keduanya ditulis sebagian. Dua bentuk
// berbeda untuk dua hal yang sama akan membuat pemanggilnya harus mengingat
// mana yang mana.
//
// KEDUANYA MENGEMBALIKAN ISI, BUKAN AMPLOPNYA — alasan yang sama dengan
// `accessibility.ts`: pemanggilnya `useQuery`/`useMutation` yang langsung
// menaruh hasilnya ke state, dan amplop yang harus dibuka dua kali di setiap
// `onSuccess` adalah amplop yang suatu saat lupa dibuka.
import {
  notificationChannelPrefsResponseSchema,
  notificationListResponseSchema,
  notificationReadAllResponseSchema,
  notificationReadResponseSchema,
  updateNotificationChannelPrefsSchema,
  type NotificationChannelPrefs,
  type NotificationListResponse,
  type NotificationReadAllResponse,
  type NotificationReadResponse,
  type UpdateNotificationChannelPrefs,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/**
 * Key cache TanStack — DILINGKUPI PEMILIKNYA, alasan lengkapnya di
 * `accessibilityKeys`: satu key tanpa parameter dipakai bersama oleh setiap
 * pengguna yang pernah masuk di tab yang sama, dan cache TanStack hidup selama
 * dokumennya, bukan selama sesinya.
 */
export const notificationPrefsKeys = {
  me: (sub: string | null) => queryKey("notification-prefs-me", { sub: sub ?? "anonim" }),
};

/**
 * GET /me/notification-prefs — preferensi kanal milik pemilik sesi.
 *
 * Selalu 200, dan setiap kanal boleh `null` = **belum pernah memilih**.
 * Pemanggil WAJIB memperlakukannya sebagai ketiadaan pilihan dan menghitung
 * kanal yang berlaku lewat `kanalBerlaku()` — bukan menggantinya dengan bawaan
 * lalu menyimpannya kembali sebagai pilihan. Menyimpan bawaan sebagai pilihan
 * membuat perubahan kebijakan bawaan di kemudian hari tidak pernah menjangkau
 * siapa pun (pelajaran ADR-008 / PR-036R).
 */
export async function getNotificationPrefs(client: ApiClient): Promise<NotificationChannelPrefs> {
  const res = await client.request("/me/notification-prefs", {
    responseSchema: notificationChannelPrefsResponseSchema,
  });
  return res.data;
}

/**
 * PUT /me/notification-prefs — simpan perubahan sebagian.
 *
 * Body divalidasi SEBELUM dikirim: skemanya `.strict()` dan menolak badan
 * kosong, jadi kanal asing maupun permintaan hampa gagal di sini alih-alih
 * setelah satu perjalanan ke server yang sudah pasti berakhir 400.
 */
export async function updateNotificationPrefs(
  client: ApiClient,
  input: UpdateNotificationChannelPrefs,
): Promise<NotificationChannelPrefs> {
  const body = updateNotificationChannelPrefsSchema.parse(input);
  const res = await client.request("/me/notification-prefs", {
    method: "PUT",
    body,
    responseSchema: notificationChannelPrefsResponseSchema,
  });
  return res.data;
}

// --- Notification center (PR-050) ---------------------------------------------

/**
 * Key cache TanStack untuk notifikasi — DILINGKUPI PEMILIKNYA, alasan
 * lengkapnya di `accessibilityKeys`.
 *
 * DUA KEY, bukan satu, dan itu bukan kelalaian. `daftar` dipakai
 * `useInfiniteQuery` di halaman center; `lencana` dipakai kerangka aplikasi yang
 * hidup di SETIAP halaman dan hanya butuh satu angka. Menyatukannya berarti
 * kerangka ikut mengunduh (dan menyimpan) seluruh halaman riwayat yang tidak
 * pernah ia tampilkan — dan `useInfiniteQuery` tidak bisa berbagi key dengan
 * `useQuery` biasa.
 *
 * Konsistensinya dijaga di satu tempat: setiap mutasi menulis `unreadCount`
 * jawaban server ke `lencana` DAN membatalkan `daftar`. Angka lencana karena itu
 * selalu berasal dari server, tidak pernah dihitung ulang di klien.
 */
export const notificationsKeys = {
  daftar: (sub: string | null, unreadOnly: boolean) =>
    queryKey("notifications-daftar", { sub: sub ?? "anonim", unreadOnly: String(unreadOnly) }),
  lencana: (sub: string | null) => queryKey("notifications-lencana", { sub: sub ?? "anonim" }),
};

export interface OpsiDaftarNotifikasi {
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
}

/**
 * GET /me/notifications — satu halaman notifikasi milik pemilik sesi.
 *
 * Mengembalikan AMPLOP UTUH (`{ data, meta }`), berbeda dari
 * `getNotificationPrefs` di atas: `meta.nextCursor` dan `meta.unreadCount`
 * keduanya dipakai pemanggil, jadi membuang amplopnya di sini hanya akan
 * memaksa setiap pemanggil merakitnya kembali.
 */
export async function listNotifications(
  client: ApiClient,
  opsi: OpsiDaftarNotifikasi = {},
): Promise<NotificationListResponse> {
  const query = new URLSearchParams();
  if (opsi.limit !== undefined) query.set("limit", String(opsi.limit));
  if (opsi.cursor !== undefined) query.set("cursor", opsi.cursor);
  // `unreadOnly` hanya dikirim bila `true`: server sudah berbawaan `false`, dan
  // parameter yang selalu ikut membuat dua permintaan yang setara punya URL
  // berbeda — yang berarti dua entri cache peramban untuk satu jawaban.
  if (opsi.unreadOnly === true) query.set("unreadOnly", "true");

  const akhiran = query.size === 0 ? "" : `?${query.toString()}`;
  return client.request(`/me/notifications${akhiran}`, {
    responseSchema: notificationListResponseSchema,
  });
}

/** POST /me/notifications/:id/read — idempoten; `readAt` yang sudah ada tidak bergeser. */
export async function markNotificationRead(
  client: ApiClient,
  id: string,
): Promise<NotificationReadResponse> {
  return client.request(`/me/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    responseSchema: notificationReadResponseSchema,
  });
}

/**
 * POST /me/notifications/read-all — tandai seluruhnya dibaca.
 *
 * Satu permintaan, bukan perulangan `markNotificationRead`: klien hanya memegang
 * halaman yang sudah diunduhnya, jadi perulangan akan menandai sebagian saja dan
 * menyisakan lencana yang tetap merah tanpa penjelasan.
 */
export async function markAllNotificationsRead(
  client: ApiClient,
): Promise<NotificationReadAllResponse> {
  return client.request("/me/notifications/read-all", {
    method: "POST",
    responseSchema: notificationReadAllResponseSchema,
  });
}
