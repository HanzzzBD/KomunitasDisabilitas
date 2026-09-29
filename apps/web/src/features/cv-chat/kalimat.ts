// Penampung kalimat untuk pengumuman screen reader (PR-068).
//
// KENAPA ADA. Token dari model tiba dalam potongan sembarang — "Terima ka",
// "sih. Berapa la", "ma …". Mengumumkan tiap potongan lewat `aria-live` membuat
// NVDA membaca serpihan kata yang saling memotong: risiko yang ditulis dokumen
// phase sendiri ("aria-live + streaming = pengalaman SR berisik"). Keputusan
// owner 2026-09-28: umumkan PER KALIMAT. Berkas ini menampung potongan dan
// melepaskan hanya kalimat yang sudah utuh.
//
// MURNI (tanpa React, tanpa DOM) supaya aturannya teruji sendiri dan bisa
// dipakai ulang klien mobile.

/**
 * Akhir kalimat: `.`, `!`, `?`, `…` — boleh diikuti penutup kutip/kurung atau
 * penutup markdown (`**`, `_`) — lalu spasi/baris baru.
 */
const AKHIR_KALIMAT = /[.!?…]+["')\]*_]*(?=\s)/g;

/**
 * Markup yang dibuang dari PENGUMUMAN saja (teks di layar tidak disentuh).
 * Bintang dan pagar dibacakan screen reader satu per satu ("bintang bintang");
 * server sudah membuangnya dari giliran yang disimpan, tetapi token mentah
 * yang sedang mengalir belum.
 */
function bersihkan(kalimat: string): string {
  return kalimat
    .replace(/\*\*|__|`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PenampungKalimat {
  /** Tambahkan potongan; kembalikan kalimat yang BARU utuh (bisa kosong). */
  tambah(potongan: string): string[];
  /** Sisa yang belum berakhir tanda baca — dipanggil saat jawaban selesai. */
  tuntaskan(): string | null;
}

export function createPenampungKalimat(): PenampungKalimat {
  let sisa = "";
  return {
    tambah(potongan) {
      sisa += potongan;
      const hasil: string[] = [];
      let potong = 0;
      for (const cocok of sisa.matchAll(AKHIR_KALIMAT)) {
        const akhir = (cocok.index ?? 0) + cocok[0].length;
        const kalimat = bersihkan(sisa.slice(potong, akhir));
        if (kalimat !== "") hasil.push(kalimat);
        potong = akhir;
      }
      sisa = sisa.slice(potong);
      return hasil;
    },
    tuntaskan() {
      const kalimat = bersihkan(sisa);
      sisa = "";
      return kalimat === "" ? null : kalimat;
    },
  };
}
