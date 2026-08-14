// Definisi route sebagai DATA, terpisah dari perakitan router.
//
// Alasannya bisa diuji: test memakai `createMemoryRouter` atas daftar yang sama
// persis dengan yang dipakai produksi. Kalau daftar ini menyatu dengan
// `createBrowserRouter`, test terpaksa merakit daftarnya sendiri — dan daftar
// kedua itu bebas menyimpang tanpa ada yang tahu.
import type { RouteObject } from "react-router";
import { TataLetak } from "./tata-letak.js";
import { LayarKesalahan } from "./kesalahan.js";

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
          const { Beranda } = await import("../routes/beranda.js");
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
          const { Masuk } = await import("../routes/masuk.js");
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
          const { MasukGoogle } = await import("../routes/masuk-google.js");
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
          const { Pengaturan } = await import("../routes/pengaturan.js");
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
              const { PengaturanAkun } = await import("../routes/pengaturan-akun.js");
              return { Component: PengaturanAkun };
            },
          },
          {
            path: "aksesibilitas",
            lazy: async () => {
              const { PengaturanAksesibilitas } = await import(
                "../routes/pengaturan-aksesibilitas.js"
              );
              return { Component: PengaturanAksesibilitas };
            },
          },
        ],
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
