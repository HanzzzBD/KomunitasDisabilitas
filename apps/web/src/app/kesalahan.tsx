// Layar kesalahan — AC PR-025 ("pesan sederhana + tombol muat ulang") dan
// AC PR-032 nomor 4 ("404 memberi jalan pulang yang jelas").
//
// Menggantikan layar bawaan React Router, yang berbahasa Inggris, menampilkan
// jejak tumpukan, dan menyapa pengembang ("💿 Hey developer 👋"). Bagi pengguna
// yang dituju produk ini, layar itu bukan sekadar jelek: ia tidak bisa dibaca,
// tidak bisa ditindaklanjuti, dan membocorkan jalur berkas internal.
//
// SATU LAYAR UNTUK SEMUA 404, bukan halaman 404 tersendiri (keputusan owner
// 2026-08-09). Route `*` bukan satu-satunya sumber 404: loader fitur kelak akan
// melemparkannya juga ("lowongan ini sudah ditutup"). Halaman 404 terpisah
// berarti DUA layar yang menjawab keadaan yang sama, dan keduanya bebas
// menyimpang — yang satu diperbaiki, yang lain tidak, dan tidak ada yang tahu
// mana yang dilihat pengguna.
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { useTeks, type KunciTeks } from "../shared/i18n/index.js";

type Keadaan = "takDitemukan" | "perluMasuk" | "umum";

/**
 * Keadaan mana yang sedang terjadi. Hanya INI yang dibaca dari error-nya;
 * teks dan aksinya diturunkan dari sini.
 */
function keadaanUntuk(error: unknown): Keadaan {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) return "takDitemukan";
    if (error.status === 401 || error.status === 403) return "perluMasuk";
  }
  return "umum";
}

/**
 * Kunci pesan per keadaan. Teksnya sendiri tinggal di katalog, dalam dua varian
 * bahasa — yang dipilih di sini hanya KEADAANNYA.
 *
 * Pesan-pesan itu menyebut LANGKAH BERIKUTNYA, bukan penyebab teknis: pengguna
 * tidak bisa berbuat apa pun dengan "500 Internal Server Error".
 */
const PESAN: Readonly<Record<Keadaan, { judul: KunciTeks; penjelasan: KunciTeks }>> = {
  takDitemukan: {
    judul: "shell.kesalahan.takDitemukan.judul",
    penjelasan: "shell.kesalahan.takDitemukan.penjelasan",
  },
  perluMasuk: {
    judul: "shell.kesalahan.perluMasuk.judul",
    penjelasan: "shell.kesalahan.perluMasuk.penjelasan",
  },
  umum: {
    judul: "shell.kesalahan.umum.judul",
    penjelasan: "shell.kesalahan.umum.penjelasan",
  },
};

/** Gaya bersama aksi — dipakai tautan maupun tombol supaya keduanya setara
 *  besar dan terlihat. `min-h-sentuh` membuat tingginya ikut preferensi target
 *  sentuh pengguna (PR-026/027), bukan angka mati. */
const GAYA_AKSI =
  "inline-flex min-h-sentuh items-center justify-center self-start rounded-md " +
  "border border-gray-900 px-6 text-base font-semibold text-gray-900";

export function LayarKesalahan() {
  const error = useRouteError();
  const t = useTeks();
  const keadaan = keadaanUntuk(error);
  const { judul, penjelasan } = PESAN[keadaan];

  return (
    // `<main>` supaya halaman kesalahan tetap punya landmark — pengguna screen
    // reader yang melompat ke konten utama tidak boleh mendarat di ketiadaan.
    //
    // Layar ini MENGGANTIKAN `TataLetak` (ErrorBoundary terpasang di route
    // induk), jadi `<main>`-nya harus datang dari sini. Ia satu-satunya
    // pengecualian atas aturan "halaman tidak menulis <main> sendiri".
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      {/* role="alert": layar ini menggantikan konten tanpa diminta, jadi
          kemunculannya harus diumumkan, bukan ditemukan sendiri. */}
      <div role="alert" className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">{t(judul)}</h1>
        <p className="text-base text-gray-900">{t(penjelasan)}</p>
      </div>

      {/*
        SATU aksi, dan aksinya BERBEDA per keadaan.

        Ini bukan kerapian melainkan koreksi: "Muat ulang halaman" pada 404
        adalah saran yang PASTI gagal — ia memuat ulang alamat yang memang tidak
        ada, dan pengguna yang menurutinya mendarat di layar yang sama persis,
        lalu menyimpulkan aplikasinya rusak. Yang ia butuhkan di sana adalah
        jalan pulang.

        Muat ulang tetap benar untuk kesalahan tak terduga: keadaan aplikasi
        sudah terbukti rusak, dan pemuatan ulang penuh satu-satunya cara yang
        pasti membersihkannya — router bisa gagal lagi dengan cara yang sama.
      */}
      {keadaan === "takDitemukan" && (
        // <Link>, bukan <a href>: ini navigasi dalam aplikasi. Memuat ulang
        // seluruh halaman membuang fokus keyboard dan memaksa screen reader
        // membacakan halaman dari awal.
        <Link to="/" className={GAYA_AKSI}>
          {t("shell.kesalahan.takDitemukan.pulang")}
        </Link>
      )}

      {keadaan === "perluMasuk" && (
        <Link to="/masuk" className={GAYA_AKSI}>
          {t("shell.kesalahan.perluMasuk.masuk")}
        </Link>
      )}

      {keadaan === "umum" && (
        // <button>, bukan <a>: ini menjalankan aksi, bukan berpindah alamat.
        // Perbedaannya nyata bagi screen reader — "tombol" dan "tautan"
        // menuntut harapan yang berbeda.
        <button type="button" className={GAYA_AKSI} onClick={() => window.location.reload()}>
          {t("shell.kesalahan.muatUlang")}
        </button>
      )}

      {/*
        Detail teknis SENGAJA tidak ditampilkan — tidak ada jejak tumpukan,
        tidak ada pesan asli. Ia tidak berguna bagi pengguna dan bisa memuat
        jalur berkas internal atau potongan data. Pengirimannya ke backend
        observability adalah PR-103.
      */}
    </main>
  );
}
