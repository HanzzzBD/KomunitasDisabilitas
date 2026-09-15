// core/pagination — cursor keyset pagination (SDD §11).
//
// Konsumen PERTAMA cursor pagination di repo ini adalah notifikasi (PR-047),
// lahir sebagai kode LOKAL modul itu (`modules/notifications/services/kursor.ts`).
// Komentarnya sejak awal sudah menjanjikan: begitu konsumen KEDUA lahir, kode
// ini pindah ke core APA ADANYA — supaya kedua modul memakai format cursor
// yang SAMA, bukan menemukan bentuknya sendiri-sendiri. Pencarian lowongan
// (PR-056) adalah konsumen kedua itu; inilah pemindahannya.
//
// BURAM, BUKAN RAHASIA. base64url di sini mencegah klien MEMBANGUN cursor
// dari tebakan, bukan menyembunyikan isinya — isinya memang nilai urut dan id
// milik baris yang sudah lolos otorisasi/filter repository pemanggil. Yang
// menjaga lingkup data (mis. "hanya notifikasi milik userId", "hanya lowongan
// published") tetap WHERE di repository masing-masing: cursor palsu sekalipun
// hanya bisa menggeser posisi DI DALAM lingkup yang sudah dibatasi pemanggilnya.
//
// Field-nya `sortAt`, BUKAN nama kolom domain (`createdAt` di notifikasi,
// `publishedAt` di lowongan) — modul ini sengaja tidak tahu kolom apa yang
// dipakai pemanggilnya untuk mengurutkan; itu keputusan repository masing-masing.
// Pemanggil bertanggung jawab memetakan nilai urut domainnya sendiri ke/dari
// `sortAt` di titik pemakaian (lihat `notifications.service.ts`/`jobs.service.ts`).

/** Posisi halaman: nilai urut + id sebagai penengah (lihat core/ids soal `id` bukan dasar urutan waktu). */
export interface PosisiKursor {
  sortAt: Date;
  id: string;
}

/** Cursor tidak terbaca — dijawab 400, bukan 500. */
export class KursorTidakValidError extends Error {
  constructor() {
    super("Cursor tidak valid");
    this.name = "KursorTidakValidError";
  }
}

export function encodeKursor(posisi: PosisiKursor): string {
  const isi = `${posisi.sortAt.toISOString()}|${posisi.id}`;
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
export function decodeKursor(cursor: string): PosisiKursor {
  let isi: string;
  try {
    isi = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new KursorTidakValidError();
  }

  const pemisah = isi.lastIndexOf("|");
  if (pemisah === -1) throw new KursorTidakValidError();

  const sortAt = new Date(isi.slice(0, pemisah));
  const id = isi.slice(pemisah + 1);
  if (Number.isNaN(sortAt.getTime()) || id.length === 0) throw new KursorTidakValidError();

  return { sortAt, id };
}
