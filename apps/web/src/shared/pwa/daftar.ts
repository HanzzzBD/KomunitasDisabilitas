// Pendaftaran service worker.
//
// Dipisah dari `main.tsx` supaya bisa diuji: yang menentukan di sini bukan
// kode pendaftarannya melainkan SYARAT-syaratnya, dan syarat yang tersembunyi
// di entry point tidak pernah punya test.
export const JALUR_SW = "/sw.js";

export interface OpsiDaftar {
  /**
   * Hanya daftarkan di build produksi.
   *
   * Di dev, service worker adalah gangguan yang mahal: ia menyimpan aset lalu
   * menyajikannya kembali, sehingga perubahan kode tampak "tidak berpengaruh"
   * dan pengembang menelusuri bug yang tidak ada. Vite HMR juga memuat modul
   * lewat jalur yang tidak boleh disentuh cache.
   */
  produksi: boolean;
  /** Diambil dari `navigator` sungguhan di produksi; disuntik saat test. */
  serviceWorker?: Pick<ServiceWorkerContainer, "register"> | undefined;
  /** Pelaporan galat — bawaan diam, sebab kegagalan di sini tidak fatal. */
  laporGagal?: (galat: unknown) => void;
}

/**
 * Daftarkan service worker bila lingkungannya mendukung.
 *
 * Mengembalikan `false` bila tidak jadi mendaftar — supaya pemanggil (dan
 * test) bisa membedakan "tidak didukung" dari "gagal".
 */
export async function daftarkanServiceWorker(opsi: OpsiDaftar): Promise<boolean> {
  if (!opsi.produksi) return false;

  const kontainer =
    opsi.serviceWorker ??
    (typeof navigator === "undefined" ? undefined : navigator.serviceWorker);

  // Browser lama, atau konteks tak aman (http non-localhost). Keduanya sah dan
  // bukan kegagalan: aplikasi tetap berjalan penuh tanpa service worker.
  if (kontainer === undefined) return false;

  try {
    await kontainer.register(JALUR_SW);
    return true;
  } catch (galat) {
    // Pendaftaran yang gagal TIDAK boleh menjatuhkan aplikasi. Service worker
    // adalah peningkatan, bukan prasyarat — dan aplikasi yang menolak terbuka
    // karena cache-nya gagal dipasang adalah kemunduran, bukan perlindungan.
    opsi.laporGagal?.(galat);
    return false;
  }
}
