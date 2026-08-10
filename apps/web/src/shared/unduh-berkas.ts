// Menyerahkan sebuah berkas kepada pengguna (PR-033b).
//
// KENAPA BUKAN `<a href>` BIASA. Endpoint ekspor menuntut header Authorization,
// dan tautan yang diklik peramban tidak membawa header apa pun — ia akan
// dijawab 401. Jadi isinya diambil lebih dulu oleh kode aplikasi, lalu
// diserahkan sebagai Blob.
//
// KENAPA DI `shared/` DAN BUKAN `features/`. Berkas ini menyentuh DOM, dan
// `features/` adalah lapisan yang dipakai ulang mobile — ia tidak boleh
// bergantung pada DOM (lihat features/README.md). Ia juga tidak menyebut
// pengguna, lowongan, atau lamaran: ia hanya tahu "nama berkas dan isinya".
/** Bagian DOM yang dipakai — disuntik test, sebab jsdom tidak punya Blob URL. */
export interface AlatUnduh {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** Elemen tautan sekali pakai; disediakan agar test bisa mengamatinya. */
  document: Pick<Document, "createElement" | "body">;
}

function alatBawaan(): AlatUnduh {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    document,
  };
}

/**
 * Mengunduh `isi` sebagai berkas bernama `nama`.
 *
 * DUA KEHATI-HATIAN DI BAWAH SENGAJA DIPERTAHANKAN MESKI CHROMIUM TIDAK
 * MENUNTUTNYA. Keduanya diuji mutasi di PR-033b: dilepas satu per satu,
 * unduhan di Chromium tetap berhasil. Yang menahan keduanya adalah gerbang
 * a11y kita hanya menjalankan SATU mesin peramban, sementara penggunanya tidak
 * — dan kegagalan yang keduanya cegah bersifat BISU (tombol ditekan, tidak
 * terjadi apa-apa, tanpa satu pun pesan galat). Bila kelak terbukti tidak ada
 * peramban target yang membutuhkannya, keduanya boleh dibuang — tetapi atas
 * bukti, bukan atas dugaan bahwa "Chromium saja sudah cukup".
 *
 * 1. TAUTANNYA DIPASANG KE DOKUMEN LALU DILEPAS LAGI. Spesifikasi tidak
 *    menjamin `click()` pada elemen lepas memicu unduhan, dan Firefox
 *    historisnya menuntut elemennya tersambung.
 *
 * 2. URL OBJEKNYA DILEPAS, TETAPI TIDAK SEKETIKA. Blob URL menahan seluruh
 *    isinya di memori sampai tab ditutup, jadi melepasnya wajib — berkas ekspor
 *    tumbuh bersama data pengguna, dan yang mengunduh tiga kali menahan tiga
 *    salinan. Tetapi melepasnya pada baris tepat setelah `click()` berlomba
 *    dengan unduhan yang baru dimulai. Penundaan satu putaran event loop cukup
 *    untuk unduhannya terlanjur mulai, dan tetap cukup cepat untuk tidak
 *    menahan memori.
 */
export function unduhBerkas(nama: string, isi: Blob, alat: AlatUnduh = alatBawaan()): void {
  const url = alat.createObjectURL(isi);

  const tautan = alat.document.createElement("a");
  tautan.href = url;
  tautan.download = nama;
  // Tersembunyi dari pembaca layar DAN dari urutan fokus: elemen ini bukan
  // bagian dari halaman, ia hanya alat sesaat.
  tautan.hidden = true;
  alat.document.body.append(tautan);
  tautan.click();
  tautan.remove();

  setTimeout(() => alat.revokeObjectURL(url), 0);
}

/** Isi JSON yang enak dibaca manusia — berkas ini dibuka orang, bukan mesin. */
export function berkasJson(isi: unknown): Blob {
  return new Blob([`${JSON.stringify(isi, null, 2)}\n`], { type: "application/json" });
}
