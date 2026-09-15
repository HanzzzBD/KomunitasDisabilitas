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
  /**
   * Halaman ini hanya bisa dicapai pengguna berperan admin (PR-052).
   *
   * Menyiratkan `butuhSesi` — tidak perlu menulis keduanya. Tanpa penanda ini,
   * `PenjagaAdmin` akan melihat peran "seeker" (bawaan `palsukanApi`) dan
   * mengalihkan ke "/", sehingga gerbangnya memeriksa halaman beranda sambil
   * mengira sedang memeriksa halaman admin.
   */
  butuhAdmin?: true;
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
  { nama: "notification center", jalur: "/notifikasi", butuhSesi: true },
  { nama: "pengaturan — preferensi notifikasi", jalur: "/pengaturan/notifikasi", butuhSesi: true },
  { nama: "pengaturan — aksesibilitas", jalur: "/pengaturan/aksesibilitas", butuhSesi: true },

  // Profil karier (PR-040) — DUA entri untuk SATU alamat, satu per keadaan
  // bagian sensitifnya. Keadaan kedua BUKAN kelengkapan yang berlebihan:
  // kolom ragam disabilitas dan kebutuhan akomodasi TIDAK ADA di DOM sebelum
  // kotak consent dicentang (lihat bagian-sensitif.tsx), jadi entri pertama
  // memeriksa halaman yang belum memuat satu pun kendali yang menjadi alasan
  // halaman ini ada.
  { nama: "profil — belum ada consent", jalur: "/profil", butuhSesi: true },
  {
    nama: "profil — kolom sensitif terbuka",
    jalur: "/profil",
    butuhSesi: true,
    siapkan: async (page) => {
      // `:text-is` = cocok PERSIS. `:has-text` akan ikut menangkap kalimat
      // bantuan di bawah kotaknya, yang memuat kata yang sama.
      await page.click("text=Saya mengizinkan Nawasena menyimpan data disabilitas saya");
      await page.waitForSelector(
        'legend:text-is("Ragam disabilitas Anda (boleh lebih dari satu)")',
      );
    },
  },

  // Wizard onboarding (PR-035) — EMPAT entri untuk SATU alamat, satu per
  // langkah. AC-nya menuntut axe dijalankan PER LANGKAH, bukan sekali untuk
  // seluruh alur: tiap langkah membawa jenis kendali yang berbeda (kotak
  // centang, penggeser, daftar deskripsi), dan memeriksa langkah pertama saja
  // berarti tiga perempat wizard tidak pernah tersentuh gerbang ini.
  //
  // Judul langkah ditunggu dengan `:text-is` (cocok PERSIS): `:has-text` akan
  // ikut cocok dengan judul halaman dan dengan nama langkah di indikator
  // progres, sehingga penantiannya selesai sebelum layarnya benar-benar
  // berganti.
  { nama: "onboarding — ragam disabilitas", jalur: "/onboarding", butuhSesi: true },
  {
    nama: "onboarding — persetujuan",
    jalur: "/onboarding",
    butuhSesi: true,
    siapkan: async (page) => {
      await page.click('button:text-is("Lanjut")');
      await page.waitForSelector('h2:text-is("Persetujuan")');
    },
  },
  {
    nama: "onboarding — preferensi",
    jalur: "/onboarding",
    butuhSesi: true,
    siapkan: async (page) => {
      await page.click('button:text-is("Lanjut")');
      await page.waitForSelector('h2:text-is("Persetujuan")');
      await page.click('button:text-is("Lanjut")');
      await page.waitForSelector('h2:text-is("Preferensi tampilan")');
    },
  },
  {
    nama: "onboarding — ringkasan",
    jalur: "/onboarding",
    butuhSesi: true,
    siapkan: async (page) => {
      await page.click('button:text-is("Lanjut")');
      await page.waitForSelector('h2:text-is("Persetujuan")');
      await page.click('button:text-is("Lanjut")');
      await page.waitForSelector('h2:text-is("Preferensi tampilan")');
      await page.click('button:text-is("Lanjut")');
      await page.waitForSelector('h2:text-is("Ringkasan")');
    },
  },

  // Admin shell (PR-052).
  { nama: "admin — ringkasan", jalur: "/admin", butuhSesi: true, butuhAdmin: true },

  // Kurasi perusahaan (PR-053).
  {
    nama: "admin — daftar perusahaan",
    jalur: "/admin/companies",
    butuhSesi: true,
    butuhAdmin: true,
  },
  {
    nama: "admin — tambah perusahaan",
    jalur: "/admin/companies/baru",
    butuhSesi: true,
    butuhAdmin: true,
  },
  {
    // Jalur LITERAL `:id` — Playwright membuka alamat ini APA ADANYA, jadi
    // `useParams().id` selalu literal `":id"`, yang tidak pernah cocok dengan
    // id UUID sungguhan mana pun. Keadaan yang teruji di sini karena itu
    // memang "perusahaan tidak ditemukan" — lihat komentar `PERUSAHAAN_UJI_ID`
    // di `palsukan-api.ts`. Keadaan form terisi + dialog verifikasi diuji
    // lewat alur sungguhan (klik "Ubah" dari daftar) di
    // `admin-companies.spec.ts`, bukan lewat registry generik ini.
    nama: "admin — ubah perusahaan (tidak ditemukan)",
    jalur: "/admin/companies/:id",
    butuhSesi: true,
    butuhAdmin: true,
  },

  // Kurasi lowongan (PR-057) — pola SAMA PERSIS dengan kurasi perusahaan di atas.
  { nama: "admin — daftar lowongan", jalur: "/admin/jobs", butuhSesi: true, butuhAdmin: true },
  {
    nama: "admin — tambah lowongan",
    jalur: "/admin/jobs/baru",
    butuhSesi: true,
    butuhAdmin: true,
  },
  {
    // Jalur LITERAL `:id` — alasan SAMA PERSIS dengan "admin — ubah
    // perusahaan (tidak ditemukan)" di atas. Keadaan form terisi + tombol
    // Terbitkan/Tutup diuji lewat alur sungguhan (klik "Ubah" dari daftar)
    // di `admin-jobs.spec.ts`, bukan lewat registry generik ini.
    nama: "admin — ubah lowongan (tidak ditemukan)",
    jalur: "/admin/jobs/:id",
    butuhSesi: true,
    butuhAdmin: true,
  },

  {
    // Profil publik perusahaan (PR-054, Gap G5). Jalur LITERAL `:id`, alasan
    // yang sama dengan "admin — ubah perusahaan" di atas: navigasi langsung
    // ke sini lewat Playwright membuat `useParams().id` bernilai literal
    // `":id"`, yang tidak pernah cocok dengan id UUID sungguhan mana pun —
    // jadi keadaan yang teruji di sini memang "perusahaan tidak ditemukan".
    // Keadaan TERISI (profil + lowongan aktif) diuji lewat navigasi langsung
    // ke id sungguhan di `companies-public.spec.ts`, bukan lewat registry ini.
    nama: "companies — profil publik (tidak ditemukan)",
    jalur: "/companies/:id",
  },

  {
    // Cari lowongan (PR-058). Keadaan terisi (hasil, filter, "muat lebih
    // banyak") diuji lewat alur sungguhan di `lowongan-browse.spec.ts`,
    // bukan lewat registry generik ini — entri ini hanya menjangkau keadaan
    // yang benar-benar dilihat setiap pengunjung: halaman kosong tanpa
    // pencarian apa pun (LOWONGAN_UJI di `palsukan-api.ts` diseting agar
    // muncul di daftar tanpa filter).
    nama: "lowongan — cari (tanpa filter)",
    jalur: "/lowongan",
  },
  {
    // Detail lowongan (PR-059). Jalur LITERAL `:id` — alasan sama dengan
    // "companies — profil publik (tidak ditemukan)": keadaan yang dijangkau
    // registry generik ini adalah "lowongan tidak ditemukan". Keadaan TERISI
    // (dan alur browse→detail→kembali) diuji di `lowongan-detail.spec.ts`.
    nama: "lowongan — detail (tidak ditemukan)",
    jalur: "/lowongan/:id",
  },

  { nama: "404", jalur: "/jalur-yang-tidak-ada" },
];
