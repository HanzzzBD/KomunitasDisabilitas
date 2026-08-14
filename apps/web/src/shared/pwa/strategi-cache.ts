// Aturan cache service worker — ADR-009: "manifest + service worker untuk
// cache **aset statis saja**".
//
// Ditulis sebagai fungsi MURNI, terpisah dari service worker-nya, karena
// inilah bagian yang berbahaya bila salah. Service worker yang keliru menyimpan
// hal yang tidak boleh disimpan akan menyajikannya berulang kali — kepada
// pengguna yang sama, tanpa batas waktu, dan tanpa cara mudah membatalkannya
// dari sisi server. Aturan seperti itu harus bisa diuji tanpa menyalakan
// browser.

/**
 * Awalan berkas hasil build Vite. Nama berkasnya ber-hash isi
 * (`index-BX1ut2nl.js`), sehingga isinya TIDAK PERNAH berubah untuk nama yang
 * sama — itulah yang membuat `cache-dulu` aman di sini dan hanya di sini.
 */
export const AWALAN_ASET = "/assets/";

/** Versi cache. Naikkan bila bentuk penyimpanannya berubah, bukan isinya. */
export const NAMA_CACHE = "nawasena-aset-v1";

export type Strategi =
  /** Ambil dari cache bila ada; kalau tidak, jaringan lalu simpan. */
  | "cache-dulu"
  /** Teruskan ke jaringan apa adanya. Service worker tidak ikut campur. */
  | "lewati";

export interface PermintaanRingkas {
  url: string;
  method: string;
  /** `true` untuk permintaan yang memuat DOKUMEN (navigasi halaman). */
  navigasi: boolean;
}

/**
 * Putuskan apa yang boleh disimpan.
 *
 * Daftar "lewati" ditulis sebagai penolakan berlapis, bukan sebagai satu
 * kondisi gabungan, supaya tiap alasan bisa dibaca dan dihapus sendiri-sendiri.
 */
export function putuskanStrategi(permintaan: PermintaanRingkas, asalSendiri: string): Strategi {
  // 1. Hanya GET. POST/PUT/DELETE mengubah keadaan di server; menyajikannya
  //    dari cache berarti mengulang aksi atau menyembunyikan kegagalannya.
  if (permintaan.method !== "GET") return "lewati";

  let url: URL;
  try {
    url = new URL(permintaan.url);
  } catch {
    return "lewati";
  }

  // 2. Hanya asal sendiri. Menyimpan respons pihak ketiga berarti menyimpan
  //    sesuatu yang tidak kita kendalikan masa berlakunya.
  if (url.origin !== asalSendiri) return "lewati";

  // 3. TIDAK PERNAH menyentuh API. Respons API bergantung pada sesi: menyimpan
  //    satu saja berarti berisiko menyajikan data satu pengguna kepada
  //    pengguna lain di perangkat yang sama. Ini penolakan terpenting di
  //    berkas ini — dijaga test tersendiri.
  if (url.pathname.startsWith("/api/")) return "lewati";

  // 4. TIDAK menyimpan dokumen HTML. `index.html` adalah satu-satunya berkas
  //    yang namanya TIDAK ber-hash; menyimpannya berarti pengguna bisa
  //    terkunci pada rujukan bundel lama tanpa cara memaksa pembaruan.
  //    Inilah kegagalan service worker yang paling sering terjadi.
  if (permintaan.navigasi) return "lewati";
  if (url.pathname === "/" || url.pathname.endsWith(".html")) return "lewati";

  // 5. Sisanya: hanya aset build ber-hash.
  if (url.pathname.startsWith(AWALAN_ASET)) return "cache-dulu";

  // Bawaan menolak. Aturan baru harus ditambahkan sadar, bukan diwarisi
  // diam-diam oleh jalur yang belum terpikirkan.
  return "lewati";
}

/** Cache selain versi berjalan — dihapus saat activate. */
export function cacheUsang(semuaNama: readonly string[]): string[] {
  return semuaNama.filter((nama) => nama.startsWith("nawasena-") && nama !== NAMA_CACHE);
}
