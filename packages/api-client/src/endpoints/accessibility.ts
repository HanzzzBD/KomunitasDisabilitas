// Endpoint preferensi aksesibilitas (PR-034 di sisi server; dikonsumsi PR-035).
//
// KENAPA PEMAKAI PERTAMANYA BARU LAHIR SEKARANG. PR-034 memasang
// `GET`/`PUT /me/accessibility` tanpa satu pun pemanggil di klien — preferensi
// masih sepenuhnya lokal (`@nawasena/a11y`, PR-026). Onboarding adalah layar
// pertama yang benar-benar meminta pengguna memilih, jadi ia pula yang pertama
// perlu menitipkan pilihan itu ke akun.
//
// KEDUANYA MENGEMBALIKAN ISI, BUKAN AMPLOPNYA — berbeda dari `getMe`/`exportMe`
// di `users.ts`, yang mengembalikan `{ data }` apa adanya. Pilihan itu
// disengaja dan sempit: satu-satunya pemakai di sini adalah `useMutation` yang
// langsung menaruh hasilnya ke store preferensi, dan amplop yang harus dibuka
// dua kali di setiap `onSuccess` adalah amplop yang suatu saat lupa dibuka.
import {
  accessibilityResponseSchema,
  updateAccessibilityPreferencesSchema,
  type AccessibilityPreferences,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/**
 * Key cache TanStack untuk preferensi sendiri.
 *
 * Tanpa params, dengan alasan yang sama seperti `usersKeys.me()`: endpoint ini
 * tidak punya saluran untuk menyebut pengguna lain, dan params (mis. userId)
 * hanya akan mengundang cache berisi preferensi orang lain dalam satu sesi
 * peramban.
 */
export const accessibilityKeys = {
  me: () => queryKey("accessibility-me"),
};

/**
 * GET /me/accessibility — preferensi milik pemilik sesi.
 *
 * Selalu 200 dengan profil lengkap: pengguna yang belum punya baris tetap
 * mendapat `ACCESSIBILITY_DEFAULTS` dari server (keputusan D4 PR-034), jadi
 * tidak ada keadaan "kosong" yang perlu ditangani pemanggil.
 */
export async function getAccessibility(client: ApiClient): Promise<AccessibilityPreferences> {
  const res = await client.request("/me/accessibility", {
    responseSchema: accessibilityResponseSchema,
  });
  return res.data;
}

/**
 * PUT /me/accessibility — simpan perubahan preferensi.
 *
 * Body divalidasi SEBELUM dikirim. `updateAccessibilityPreferencesSchema`
 * bersifat `.strict()`: field asing ditolak di sini, bukan setelah satu
 * perjalanan ke server yang sudah pasti berakhir 400. Itu penting justru karena
 * pemanggilnya menyusun body dari state UI — dan state UI adalah tempat field
 * tambahan paling mudah menyelinap masuk.
 */
export async function updateAccessibility(
  client: ApiClient,
  input: UpdateAccessibilityPreferences,
): Promise<AccessibilityPreferences> {
  const body = updateAccessibilityPreferencesSchema.parse(input);
  const res = await client.request("/me/accessibility", {
    method: "PUT",
    body,
    responseSchema: accessibilityResponseSchema,
  });
  return res.data;
}
