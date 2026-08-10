// Endpoint profil akun sendiri (PR-020 di sisi server; dikonsumsi PR-033a).
//
// KENAPA `/me` BARU LAHIR SEKARANG. PR-030a sengaja menunda pertanyaan "siapa
// pengguna yang sedang masuk": `POST /auth/refresh` hanya mengembalikan token
// tanpa identitas, jadi sesi yang dipulihkan saat reload tahu BAHWA pengguna
// masuk tetapi tidak tahu SIAPA. Menjawabnya lebih awal berarti menebak bentuk
// yang dibutuhkan halaman pertama yang menampilkan identitas — dan tebakan itu
// akan terlanjur dipakai sebelum ketahuan salah.
//
// Halaman pertama itu ada sekarang: `/pengaturan`. Jadi jawabannya ditulis di
// sini, dalam bentuk yang halaman itu benar-benar pakai.
import { meResponseSchema, type MeResponse } from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/**
 * Key cache TanStack untuk domain users.
 *
 * Tanpa params: `/me` tidak punya variasi — identitasnya datang dari sesi, dan
 * endpoint-nya sengaja tidak punya saluran untuk menyebut pengguna lain.
 * Memberinya params (mis. userId) akan mengundang cache yang berisi data
 * pengguna berbeda dalam satu sesi peramban.
 */
export const usersKeys = {
  me: () => queryKey("users-me"),
};

/**
 * GET /me — profil akun milik pemilik sesi.
 *
 * Response diparse `meResponseSchema`: kontrak yang menyimpang terbaca sebagai
 * kegagalan berkode di sini, bukan sebagai `undefined` yang menyebar sampai ke
 * layar dalam bentuk baris kosong tanpa sebab yang terlihat.
 */
export async function getMe(client: ApiClient): Promise<MeResponse> {
  return client.request("/me", { responseSchema: meResponseSchema });
}

// `PUT /me` sengaja BELUM ada di sini meski kontraknya sudah final sejak
// PR-020: pemakainya baru lahir di PR-035 (onboarding). Endpoint tanpa pemakai
// adalah kode yang tidak pernah dijalankan siapa pun, dan bentuknya bebas
// menyimpang dari kebutuhan halaman yang kelak memakainya.
