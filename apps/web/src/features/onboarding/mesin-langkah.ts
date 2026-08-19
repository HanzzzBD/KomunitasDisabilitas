// Navigasi antar-langkah wizard onboarding (PR-035) — AC PR-035 "unit test
// (state wizard)".
//
// TANPA REACT, TANPA DOM, dengan sengaja. Batas-batasnya ("tidak ada langkah
// sebelum yang pertama", "tidak ada langkah sesudah yang terakhir") adalah
// tempat wizard paling mudah salah, dan menguji mereka lewat komponen berarti
// menempuh empat render hanya untuk memeriksa satu penjumlahan. Di sini ia
// diperiksa sebagai fungsi.
//
// `LEWATI` DAN `SELESAI` SENGAJA BUKAN AKSI DI SINI. Keduanya bukan transisi
// antar-langkah melainkan JALAN KELUAR: mereka menutup wizard dari langkah mana
// pun, menulis penanda selesai, lalu memindahkan halaman. Menjadikannya aksi
// reducer akan melahirkan keadaan "sudah keluar tetapi masih punya indeks", dan
// keadaan itu harus ditangani di setiap tempat yang membaca indeksnya.
// Ketiadaannya di sini pula yang membuat "boleh dilewati kapan saja" (AC 1)
// benar tanpa satu pun percabangan — tidak ada transisi yang bisa salah.

/**
 * Empat langkah, berurutan. Batas atas ini bagian dari mitigasi risiko ticket
 * ("maksimal 4 langkah, skippable, progress jelas") — panjangnya diturunkan
 * dari daftar ini, bukan diketik ulang di komponen.
 */
export const LANGKAH = ["ragam", "persetujuan", "preferensi", "ringkasan"] as const;

export type Langkah = (typeof LANGKAH)[number];

export interface StateWizard {
  /** 0..LANGKAH.length-1 */
  indeks: number;
  /**
   * Langkah yang PERNAH dibuka, per indeks.
   *
   * Dipakai indikator progres. Ia hanya bertambah: pengguna yang mundur tidak
   * "membatalkan" kunjungannya, dan indikator yang menyala-padam saat mundur
   * membuat pengguna mengira ia kehilangan kemajuan.
   */
  dikunjungi: readonly boolean[];
}

export type AksiWizard = { type: "MAJU" } | { type: "MUNDUR" };

export function initStateWizard(): StateWizard {
  return { indeks: 0, dikunjungi: LANGKAH.map((_, i) => i === 0) };
}

export function reduksiWizard(state: StateWizard, aksi: AksiWizard): StateWizard {
  if (aksi.type === "MAJU") {
    // Batasnya ditegakkan DI SINI, bukan di pemanggil. Penjaga yang tinggal di
    // komponen adalah penjaga yang hilang begitu ada pemanggil kedua.
    if (state.indeks >= LANGKAH.length - 1) return state;
    const indeks = state.indeks + 1;
    return { indeks, dikunjungi: state.dikunjungi.map((v, i) => v || i === indeks) };
  }

  if (aksi.type === "MUNDUR") {
    if (state.indeks <= 0) return state;
    // `dikunjungi` tidak disentuh — lihat catatan pada field-nya.
    return { ...state, indeks: state.indeks - 1 };
  }

  return state;
}

/** Langkah yang sedang tampil. Dipisah supaya komponen tidak mengindeks sendiri. */
export function langkahSaatIni(state: StateWizard): Langkah {
  return LANGKAH[state.indeks] ?? LANGKAH[0];
}
