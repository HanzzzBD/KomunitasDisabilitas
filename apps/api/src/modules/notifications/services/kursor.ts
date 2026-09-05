// modules/notifications — sandi cursor pagination (PR-047, SDD §11).
//
// KENAPA BUKAN DI core/. Ini konsumen PERTAMA cursor pagination di repo; yang
// kedua (pencarian lowongan, PR-058) dan ketiga (daftar lamaran, PR-076) sudah
// bernama dan sudah terjadwal. Saat salah satunya lahir, kode ini pindah ke core
// APA ADANYA — yang tidak boleh terjadi adalah masing-masing menemukan format
// cursor-nya sendiri, sebab bagi klien cursor adalah string buram: dua format
// berbeda tidak akan pernah terlihat salah sampai seseorang menukarnya.
//
// BURAM, BUKAN RAHASIA. base64url di sini mencegah klien MEMBANGUN cursor dari
// tebakan, bukan menyembunyikan isinya — isinya memang waktu dan id milik
// pengguna itu sendiri. Yang menjaga kepemilikan tetap `where userId` di
// repository: cursor palsu sekalipun hanya bisa menggeser posisi di dalam
// daftar milik pemanggilnya.
import type { KursorHalaman } from "../repositories/notifications.repository.js";

/** Cursor tidak terbaca — dijawab 400, bukan 500. */
export class KursorTidakValidError extends Error {
  constructor() {
    super("Cursor tidak valid");
    this.name = "KursorTidakValidError";
  }
}

export function encodeKursor(posisi: KursorHalaman): string {
  const isi = `${posisi.createdAt.toISOString()}|${posisi.id}`;
  return Buffer.from(isi, "utf8").toString("base64url");
}

/**
 * Baca cursor. Melempar `KursorTidakValidError` untuk SETIAP bentuk yang tidak
 * dikenali — termasuk base64 yang sah tetapi berisi tanggal ngawur.
 *
 * Diam-diam mengabaikan cursor rusak (mis. mengembalikan halaman pertama) akan
 * membuat klien yang salah menggulir selamanya di halaman yang sama tanpa satu
 * pun tanda bahwa ada yang keliru.
 */
export function decodeKursor(cursor: string): KursorHalaman {
  let isi: string;
  try {
    isi = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new KursorTidakValidError();
  }

  const pemisah = isi.lastIndexOf("|");
  if (pemisah === -1) throw new KursorTidakValidError();

  const createdAt = new Date(isi.slice(0, pemisah));
  const id = isi.slice(pemisah + 1);
  if (Number.isNaN(createdAt.getTime()) || id.length === 0) throw new KursorTidakValidError();

  return { createdAt, id };
}
