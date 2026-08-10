// Endpoint hapus akun (PR-021 di sisi server; dikonsumsi PR-033c).
//
// TIDAK DIGABUNG KE `endpoints/auth.ts`, meski jalurnya `/auth/account`.
// Berkas itu berisi PINTU MASUK — permintaan dari pemanggil yang belum punya
// sesi. Yang ini kebalikannya: aksi paling final atas akun yang sudah masuk,
// dan satu-satunya rute `/auth/*` yang menuntut access token. Menaruhnya di
// sana akan membuat "semua isi berkas ini publik" berhenti benar, dan kalimat
// itulah yang menjaga endpoint baru tidak lahir terbuka tanpa disadari.
import { deleteAccountSchema, type DeleteAccount } from "@nawasena/schemas";
import type { ApiClient } from "../client.js";

/**
 * DELETE /auth/account — hapus akun sendiri.
 *
 * TIDAK MENGEMBALIKAN APA PUN. Server menjawab 204 tanpa body dengan sengaja:
 * jumlah sesi yang ikut dicabut berguna bagi audit, tidak bagi pengguna.
 *
 * SESUDAH INI SESI SUDAH MATI. Cookie refresh dihapus server, `token_version`
 * dinaikkan, dan seluruh refresh token dicabut — jadi pemanggil WAJIB
 * membuang sesinya sendiri. Access token yang masih tersimpan di memori klien
 * akan ditolak permintaan berikutnya, dan yang muncul di layar adalah
 * pengalihan ke halaman masuk tanpa penjelasan.
 *
 * Body divalidasi SEBELUM dikirim: skema menuntut TEPAT satu cara pembuktian,
 * dan permintaan yang membawa dua (atau nol) ditolak di sini — bukan setelah
 * satu perjalanan ke server yang sudah pasti gagal.
 */
export async function deleteAccount(client: ApiClient, input: DeleteAccount): Promise<void> {
  const body = deleteAccountSchema.parse(input);
  await client.request("/auth/account", { method: "DELETE", body });
}
