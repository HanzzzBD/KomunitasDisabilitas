// Registry halaman yang dijaga gerbang aksesibilitas — AC PR-031 nomor 3:
// "Registry halaman mudah ditambah per PR fitur".
//
// SATU daftar, dipakai axe DAN Lighthouse. Dua daftar terpisah akan menyimpang
// diam-diam, dan yang menyimpang di sini berarti sebuah halaman dijaga oleh
// separuh gerbang tanpa ada yang tahu separuh mana.
//
// MENAMBAH HALAMAN: tambahkan satu entri. Tidak ada berkas lain yang perlu
// disentuh — itulah yang dimaksud "mudah ditambah". Penjaga di
// `registry-halaman.test.ts` menuntut tiap entri punya nama unik dan jalur yang
// masuk akal, sehingga entri asal-asalan tidak lolos diam-diam.

export interface HalamanDijaga {
  /** Nama untuk laporan CI — inilah yang dibaca orang saat gerbangnya merah. */
  nama: string;
  /** Jalur relatif terhadap baseURL. */
  jalur: string;
  /**
   * Dijalankan sebelum pemeriksaan, untuk halaman yang perlu disiapkan lebih
   * dulu (mis. menempuh satu langkah form). Sengaja bertipe longgar supaya
   * berkas ini tidak perlu mengimpor Playwright — ia juga dibaca skrip
   * Lighthouse yang berjalan di luar Playwright.
   */
  siapkan?: (page: {
    fill: (sel: string, nilai: string) => Promise<void>;
    click: (sel: string) => Promise<void>;
    waitForSelector: (sel: string) => Promise<unknown>;
  }) => Promise<void>;
  /**
   * Aturan axe yang DIMATIKAN untuk halaman ini, beserta alasannya.
   *
   * Ditulis sebagai objek berisi alasan, bukan larik id, dengan sebab yang
   * sama seperti `TAK_BISA_DI_JSDOM`: pengecualian tanpa alasan tertulis
   * berubah menjadi pengecualian permanen yang tidak ada yang berani hapus.
   */
  matikan?: Readonly<Record<string, string>>;
  /**
   * Halaman ini hanya bisa dicapai pengguna yang sudah masuk (PR-033a).
   *
   * Tanpa penanda ini, halaman terlindungi akan MENGALIHKAN ke `/masuk` saat
   * diperiksa — sebab jawaban palsu untuk `/auth/refresh` adalah 401 — dan
   * gerbangnya berakhir hijau setelah memeriksa halaman masuk sambil mengira
   * sedang memeriksa halaman fitur. Persis jenis kegagalan yang paling mahal:
   * ia tidak pernah merah, jadi tidak ada yang menyelidikinya.
   *
   * Penandanya membuat `aksesibilitas.spec.ts` menjawab permintaan pemulihan
   * sesi dengan sesi yang sah, dan spec itu MEMASTIKAN alamatnya tidak berpindah
   * setelah halaman dimuat.
   */
  butuhSesi?: true;
}

export const HALAMAN: readonly HalamanDijaga[] = [
  { nama: "beranda", jalur: "/" },
  { nama: "masuk — langkah nomor", jalur: "/masuk" },
  {
    nama: "masuk — langkah kode",
    jalur: "/masuk",
    siapkan: async (page) => {
      await page.fill("input[autocomplete='tel']", "081234567890");
      await page.click("button[type='submit']");
      await page.waitForSelector("input[autocomplete='one-time-code']");
    },
  },
  {
    nama: "masuk google — kegagalan",
    // Tanpa titipan di sessionStorage, halaman ini menampilkan keadaan
    // gagalnya. Keadaan GAGAL sengaja ikut dijaga: ia yang paling jarang
    // dilihat saat mengembangkan, dan paling sering luput dari perhatian.
    jalur: "/masuk/google?error=access_denied",
  },
  { nama: "pengaturan — akun & data saya", jalur: "/pengaturan", butuhSesi: true },
  { nama: "pengaturan — aksesibilitas", jalur: "/pengaturan/aksesibilitas", butuhSesi: true },
  { nama: "404", jalur: "/jalur-yang-tidak-ada" },
];
