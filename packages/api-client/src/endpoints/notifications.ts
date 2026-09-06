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
  updateNotificationChannelPrefsSchema,
  type NotificationChannelPrefs,
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
