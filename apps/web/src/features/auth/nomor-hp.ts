// Normalisasi nomor HP — pintu masuk paling sempit di seluruh produk.
//
// `phoneNumberSchema` (packages/schemas) menuntut E.164: `+62` diikuti 8–13
// angka. Yang DITULIS orang Indonesia hampir selalu bukan itu — melainkan
// `0812…`, kadang dengan spasi atau tanda hubung, kadang `62812…` karena
// disalin dari kontak WhatsApp.
//
// Menolak semua bentuk itu secara teknis benar dan secara produk salah.
// Pengguna yang ditolak di kotak pertama tidak menyalahkan formatnya — ia
// menyimpulkan aplikasinya tidak bisa dipakai, lalu pergi. Dan yang paling
// dirugikan justru pengguna yang paling sulit mengetik ulang: persona Sari
// (motorik terbatas) dan pengguna yang mengetik lewat suara.
//
// Karena itu bentuk-bentuk lazim DITERIMA lalu diterjemahkan, bukan ditolak.
import { phoneNumberSchema } from "@nawasena/schemas";

/**
 * Ubah tulisan apa adanya menjadi E.164, atau `null` bila memang tidak bisa.
 *
 * `null` berarti "ini bukan nomor HP Indonesia" — bukan "formatnya kurang
 * rapi". Kerapian diurus di sini, bukan oleh pengguna.
 */
export function normalkanNomor(mentah: string): string | null {
  // Spasi, tanda hubung, titik, dan tanda kurung dibuang lebih dulu: semuanya
  // cara wajar menulis nomor telepon, dan tidak satu pun mengubah maknanya.
  const bersih = mentah.replace(/[\s\-.()]/g, "");
  if (bersih === "") return null;

  let e164: string;
  if (bersih.startsWith("+62")) {
    e164 = bersih;
  } else if (bersih.startsWith("62")) {
    // Disalin dari daftar kontak WhatsApp, yang kerap membuang tanda plus.
    e164 = `+${bersih}`;
  } else if (bersih.startsWith("0")) {
    // Bentuk yang paling lazim ditulis manusia.
    e164 = `+62${bersih.slice(1)}`;
  } else {
    return null;
  }

  // Divalidasi skema yang SAMA dengan yang dipakai server, bukan regex kedua
  // di sini. Aturan yang ditulis dua kali adalah aturan yang akan berbeda.
  return phoneNumberSchema.safeParse(e164).success ? e164 : null;
}
