// core/ids — UUID v7 (RFC 9562): 48-bit timestamp ms + random.
// Ketetapan SDD §14: semua PK uuid v7 (sortable → index locality bagus).
// Di-generate APLIKASI (bukan default DB — gen_random_uuid() = v4).
// Implementasi murni tanpa dependensi; cukup untuk kebutuhan Nawasena
// (sortable antar-milidetik; urutan DALAM milidetik yang sama tidak dijamin).
//
// BATAS DI ATAS ITU NYATA, BUKAN TEORETIS — dan pernah menggigit. Sampai
// migrasi 11 (2026-09-05), `ORDER BY id DESC` dipakai sebagai "urutan terbaru
// dulu" untuk keahlian/riwayat karier. Tiga baris yang ditambahkan beruntun
// kerap jatuh di satu milidetik, lalu keluar dalam urutan acak: `career-db`
// merah sesekali di CI, dan daftar yang urutannya salah bagi pengguna yang
// mengisi formulir dengan cepat.
//
// ATURANNYA: JANGAN memakai `id` sebagai dasar urutan waktu. Tabel yang butuh
// "terbaru dulu" wajib punya kolom `created_at timestamptz(6)` sendiri; `id`
// hanya boleh menjadi penengah TERAKHIR agar hasilnya tetap (bukan agar benar).
import { randomBytes } from "node:crypto";

export function uuidV7(now: number = Date.now()): string {
  const bytes = randomBytes(16);

  // 48 bit pertama = timestamp ms big-endian.
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // versi 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // varian RFC (10xx)

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
