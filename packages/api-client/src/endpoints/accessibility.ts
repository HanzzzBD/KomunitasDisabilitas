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
  type AccessibilityProfile,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/**
 * Key cache TanStack untuk preferensi sendiri — DILINGKUPI PEMILIKNYA.
 *
 * Versi sebelumnya adalah `queryKey("accessibility-me")` tanpa parameter, dengan
 * alasan tertulis "params hanya akan mengundang cache berisi preferensi orang
 * lain". Alasan itu terbalik dari akibatnya: satu key tanpa parameter dipakai
 * BERSAMA oleh setiap pengguna yang pernah masuk di tab yang sama, jadi justru
 * bentuk itulah yang menyimpan preferensi orang lain di satu entri. Cache
 * TanStack hidup selama dokumennya, bukan selama sesinya, dan `keluar()` tidak
 * membuangnya.
 *
 * `sub` (klaim subjek JWT) sebagai pelingkup: pengguna B tidak akan pernah
 * membaca entri milik A karena keduanya bukan key yang sama — bukan karena ada
 * kode yang ingat membersihkannya. Untuk sesi yang belum dikenali, `null`
 * memberi laci terpisah lagi, sehingga jawaban pra-login pun tidak menetes ke
 * pengguna mana pun.
 */
export const accessibilityKeys = {
  me: (sub: string | null) => queryKey("accessibility-me", { sub: sub ?? "anonim" }),
};

/**
 * GET /me/accessibility — preferensi milik pemilik sesi.
 *
 * Selalu 200 dengan tujuh field, tetapi setiap field boleh `null` = **belum
 * diatur**. Pemanggil WAJIB memperlakukan `null` sebagai ketiadaan pilihan, dan
 * TIDAK boleh menggantinya dengan bawaan lalu menyimpannya sebagai pilihan —
 * justru itu yang membuat sinyal OS (ADR-008) tak terjangkau.
 */
export async function getAccessibility(client: ApiClient): Promise<AccessibilityProfile> {
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
): Promise<AccessibilityProfile> {
  const body = updateAccessibilityPreferencesSchema.parse(input);
  const res = await client.request("/me/accessibility", {
    method: "PUT",
    body,
    responseSchema: accessibilityResponseSchema,
  });
  return res.data;
}
