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
  {
    // Dialog hapus akun (PR-033c-1) — AC PR-033 nomor 3.
    //
    // Terdaftar TERPISAH meski alamatnya sama, sebab keadaan yang diperiksa
    // berbeda: dialog terbuka membawa tombol perusak berlatar merah, dan
    // kontras warnanya termasuk yang TIDAK BISA diperiksa jsdom sama sekali
    // (`TAK_BISA_DI_JSDOM`, PR-031a). Lapis kedua akan meluluskan teks putih di
    // atas latar apa pun tanpa berkomentar.
    nama: "pengaturan — dialog hapus akun",
    jalur: "/pengaturan",
    butuhSesi: true,
    siapkan: async (page) => {
      // `:text-is` = cocok PERSIS. `:has-text` akan ikut menangkap tombol
      // "Hapus akun saya sekarang" di dalam dialog, dan yang tertekan menjadi
      // tombol yang berbeda tergantung urutan render.
      await page.click('button:text-is("Hapus akun saya")');
      await page.waitForSelector('[role="dialog"]');

      // DITEMPUH SAMPAI LANGKAH KEDUA, bukan berhenti di langkah pertama.
      // Tombol merahnya baru dirender di sana — dan tombol itulah satu-satunya
      // alasan halaman ini didaftarkan. Berhenti di langkah pertama berarti
      // gerbangnya hijau atas layar yang tidak memuat apa pun yang ingin
      // diperiksa.
      await page.click('button:text-is("Saya mengerti, lanjutkan")');
      await page.click('button:text-is("Kirim kode ke nomor saya")');
      await page.waitForSelector("input[autocomplete='one-time-code']");

      // KODENYA IKUT DIISI, dan itu bukan kelengkapan yang berlebihan.
      // Selama kotaknya kosong, tombol perusak ber-`aria-disabled` — dan axe
      // MELEWATI pemeriksaan kontras pada kendali nonaktif (memang begitu
      // aturannya). Tanpa langkah ini, entri ini memeriksa satu-satunya hal
      // yang menjadi alasannya ada sambil melewatinya. Terbukti: uji mutasi
      // yang mengganti latar tombol menjadi merah muda tetap hijau sampai
      // baris ini ditambahkan.
      await page.fill("input[autocomplete='one-time-code']", "123456");
    },
  },
  { nama: "pengaturan — aksesibilitas", jalur: "/pengaturan/aksesibilitas", butuhSesi: true },
  { nama: "404", jalur: "/jalur-yang-tidak-ada" },
];
