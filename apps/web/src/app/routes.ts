// Definisi route sebagai DATA, terpisah dari perakitan router.
//
// Alasannya bisa diuji: test memakai `createMemoryRouter` atas daftar yang sama
// persis dengan yang dipakai produksi. Kalau daftar ini menyatu dengan
// `createBrowserRouter`, test terpaksa merakit daftarnya sendiri — dan daftar
// kedua itu bebas menyimpang tanpa ada yang tahu.
import type { RouteObject } from "react-router";
import { TataLetak } from "./tata-letak.js";
import { LayarKesalahan } from "./kesalahan.js";
import { muatKatalog } from "../shared/i18n/index.js";

// KATALOG TEKS IKUT DIMUAT DI SINI, BERSAMA KOMPONENNYA.
//
// `Promise.all`, bukan berurutan: keduanya berkas terpisah yang tidak saling
// bergantung, dan menunggunya bergiliran menambah satu perjalanan jaringan
// pada setiap perpindahan halaman.
//
// Menunggu katalog SEBELUM route dianggap siap adalah intinya. Bila komponen
// boleh tampil lebih dulu, render pertamanya memakai teks cadangan lalu
// berkedip berganti — tepat jenis perubahan mendadak yang paling mengganggu
// pengguna autisme (PRD persona Dimas), dan pada mode `id-simple` justru
// pengguna itulah yang paling mungkin membacanya.
//
// Kenapa di sini dan bukan di dalam komponen: komponen yang memuat katalognya
// sendiri selalu merender sekali tanpa teks. `lazy:` route adalah satu-satunya
// tempat yang dijalankan SEBELUM apa pun tampil.

/**
 * Satu route INDUK membungkus semuanya, dengan dua alasan yang keduanya soal
 * "tidak bisa lupa":
 *
 * 1. `Component: TataLetak` — banner luring hadir di setiap halaman tanpa tiap
 *    halaman perlu mengingatnya.
 * 2. `errorElement` di induk menangkap kegagalan SELURUH anaknya. Dipasang per
 *    halaman, ia akan terlewat pada halaman yang ditambahkan belakangan — dan
 *    yang muncul di sana adalah layar bawaan React Router berbahasa Inggris
 *    lengkap dengan jejak tumpukan.
 *
 * Induk ini SENGAJA tidak lazy: ia bagian dari shell yang selalu dibutuhkan,
 * dan memuatnya lazy hanya menambah satu perjalanan bolak-balik sebelum apa pun
 * bisa tampil.
 */
export const ruteApp: RouteObject[] = [
  {
    path: "/",
    Component: TataLetak,
    // `ErrorBoundary` (komponen), bukan `errorElement` (elemen JSX): berkas ini
    // tetap `.ts` murni data, tanpa satu pun markup.
    ErrorBoundary: LayarKesalahan,
    children: [
      {
        index: true,
        lazy: async () => {
          const [{ Beranda }] = await Promise.all([
            import("../routes/beranda.js"),
            muatKatalog("beranda"),
          ]);
          return { Component: Beranda };
        },
      },
      {
        // Halaman login diisi PR-030. Ada di sini sejak sekarang karena
        // `http://localhost:5173/masuk/google` SUDAH terdaftar sebagai redirect
        // URI di Google Cloud Console — jalur URL-nya bagian dari kontrak yang
        // sudah disepakati pihak luar, bukan sesuatu yang bebas dipilih
        // belakangan.
        path: "masuk",
        lazy: async () => {
          const [{ Masuk }] = await Promise.all([
            import("../routes/masuk.js"),
            muatKatalog("auth"),
          ]);
          return { Component: Masuk };
        },
      },
      {
        // Kembalian dari Google (PR-030c). Terdaftar SEBAGAI SAUDARA `masuk`,
        // bukan anaknya: halaman ini menggantikan seluruh isi halaman masuk,
        // dan sebagai route anak ia akan menuntut `<Outlet />` di sana —
        // menyeret halaman masuk ikut dirender di belakang layar penukaran.
        path: "masuk/google",
        lazy: async () => {
          const [{ MasukGoogle }] = await Promise.all([
            import("../routes/masuk-google.js"),
            // `pengaturan` ikut: halaman ini merender konfirmasi hapus akun
            // (`features/akun`), yang teksnya tinggal di katalog pengaturan.
            muatKatalog("auth", "pengaturan"),
          ]);
          return { Component: MasukGoogle };
        },
      },
      {
        // Pengaturan (PR-033a) — route TERLINDUNGI pertama di aplikasi ini.
        //
        // Penjagaannya dipasang di dalam komponen `Pengaturan`, bukan di sini:
        // berkas ini `.ts` murni data, dan membungkus route dengan `<Terlindungi>`
        // akan memaksanya menjadi `.tsx`. Karena penjaganya ada di INDUK, setiap
        // panel yang ditambahkan kelak ikut terjaga tanpa perlu diingat.
        //
        // Induknya TIDAK lazy sementara anak-anaknya lazy: kerangkanya kecil dan
        // selalu dibutuhkan begitu salah satu panel dibuka, sedangkan tiap panel
        // hanya diunduh oleh yang benar-benar membukanya.
        path: "pengaturan",
        lazy: async () => {
          const [{ Pengaturan }] = await Promise.all([
            import("../routes/pengaturan.js"),
            muatKatalog("pengaturan"),
          ]);
          return { Component: Pengaturan };
        },
        children: [
          {
            // Panel indeks: "/pengaturan" LANGSUNG menampilkan Akun & Data Saya,
            // tanpa pengalihan ke "/pengaturan/akun".
            //
            // Pengalihan di halaman indeks memang lazim, tetapi ia membuat satu
            // alamat yang dibagikan orang selalu berakhir di alamat lain — dan
            // pengguna yang menekan tombol kembali sesudahnya terlempar bolak-balik.
            // Dengan dua panel saja, alamat indeks lebih baik BERISI daripada
            // menunjuk.
            index: true,
            lazy: async () => {
              const [{ PengaturanAkun }] = await Promise.all([
                import("../routes/pengaturan-akun.js"),
                // `auth` ikut: alur hapus akun memetakan kode galat OTP ke
                // `auth.galat.*` (`features/akun/hapus-akun.ts`).
                muatKatalog("pengaturan", "auth"),
              ]);
              return { Component: PengaturanAkun };
            },
          },
          {
            path: "aksesibilitas",
            lazy: async () => {
              // DUA katalog, dan yang kedua mudah terlewat: panel aksesibilitas
              // memakai label ketujuh sakelarnya dari katalog ONBOARDING —
              // sengaja, supaya wizard dan panel menamai sakelar yang sama
              // dengan kata yang sama (lihat features/aksesibilitas-panel).
              const [{ PengaturanAksesibilitas }] = await Promise.all([
                import("../routes/pengaturan-aksesibilitas.js"),
                muatKatalog("pengaturan", "onboarding"),
              ]);
              return { Component: PengaturanAksesibilitas };
            },
          },
        ],
      },
      {
        // Profil karier (PR-040) — SAUDARA `pengaturan`, bukan anaknya.
        //
        // Panel pengaturan menjawab "bagaimana aplikasi ini berperilaku untuk
        // saya". Profil karier bukan setelan: ia ISI yang dipakai mencarikan
        // pekerjaan, dan ia akan menjadi tujuan tautan dari beranda, dari hasil
        // pencocokan (PR-069), dan dari alur melamar (Phase 11). Menyarangkannya
        // di bawah `/pengaturan` membuat setiap tautan itu mengantar pengguna ke
        // layar bernavigasi setelan, di tengah pekerjaan yang bukan menyetel.
        //
        // Penjagaan sesinya ada di dalam komponen `Profil`, alasan yang sama
        // seperti `Pengaturan` dan `Onboarding`: berkas ini `.ts` murni data.
        path: "profil",
        lazy: async () => {
          const [{ Profil }] = await Promise.all([
            import("../routes/profil.js"),
            // `onboarding` ikut: halaman profil memakai ULANG komponen langkah
            // ragam disabilitas milik onboarding, berikut kuncinya.
            muatKatalog("profil", "onboarding"),
          ]);
          return { Component: Profil };
        },
      },
      {
        // Onboarding aksesibilitas (PR-035) — SAUDARA `pengaturan`, bukan
        // anaknya: ia alur pertama-kali, bukan panel setelan. Menyarangkannya
        // di bawah `/pengaturan` akan menyeret kerangka navigasi panel ikut
        // terpasang di layar yang justru harus sesedikit mungkin gangguannya.
        //
        // Penjagaan sesi DAN sakelar operasionalnya ada di dalam komponen
        // `Onboarding`, dengan alasan yang sama seperti `Pengaturan`: berkas
        // ini `.ts` murni data.
        path: "onboarding",
        lazy: async () => {
          const [{ Onboarding }] = await Promise.all([
            import("../routes/onboarding.js"),
            muatKatalog("onboarding"),
          ]);
          return { Component: Onboarding };
        },
      },
      {
        // Menangkap URL asing. Tanpa ini, alamat salah ketik jatuh ke layar
        // bawaan React Router alih-alih pesan kita.
        //
        // Melempar Response 404, BUKAN merender LayarKesalahan langsung: layar
        // itu membaca `useRouteError()`, yang kosong bila dirender sebagai
        // halaman biasa — hasilnya pesan umum "ada yang tidak berjalan
        // semestinya", padahal yang terjadi jelas "halaman tidak ditemukan".
        // Dilempar sebagai error, ia sampai ke ErrorBoundary induk dengan
        // status yang benar.
        //
        // Halaman 404 yang sesungguhnya — dengan jalan pulang yang jelas —
        // milik PR-032.
        path: "*",
        loader: () => {
          throw new Response("Tidak ditemukan", { status: 404 });
        },
      },
    ],
  },
];
