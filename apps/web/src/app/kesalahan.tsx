// Layar kesalahan — AC PR-025: "Error boundary menampilkan pesan sederhana +
// tombol muat ulang".
//
// Menggantikan layar bawaan React Router, yang berbahasa Inggris, menampilkan
// jejak tumpukan, dan menyapa pengembang ("💿 Hey developer 👋"). Bagi pengguna
// yang dituju produk ini, layar itu bukan sekadar jelek: ia tidak bisa dibaca,
// tidak bisa ditindaklanjuti, dan membocorkan jalur berkas internal.
import { isRouteErrorResponse, useRouteError } from "react-router";

/**
 * Pesan per keadaan, dalam bahasa yang menyebut LANGKAH BERIKUTNYA, bukan
 * penyebab teknis. Pengguna tidak bisa berbuat apa pun dengan "500 Internal
 * Server Error"; mereka bisa berbuat sesuatu dengan "coba lagi sebentar lagi".
 */
function pesanUntuk(error: unknown): { judul: string; penjelasan: string } {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        judul: "Halaman tidak ditemukan",
        penjelasan: "Alamat yang Anda tuju mungkin salah ketik atau sudah dipindahkan.",
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        judul: "Anda belum bisa membuka halaman ini",
        penjelasan: "Coba masuk lebih dulu, lalu buka kembali halaman ini.",
      };
    }
  }

  return {
    judul: "Ada yang tidak berjalan semestinya",
    penjelasan: "Ini bukan kesalahan Anda. Coba muat ulang halaman ini.",
  };
}

export function LayarKesalahan() {
  const error = useRouteError();
  const { judul, penjelasan } = pesanUntuk(error);

  return (
    // `<main>` supaya halaman kesalahan tetap punya landmark — pengguna screen
    // reader yang melompat ke konten utama tidak boleh mendarat di ketiadaan.
    <main>
      {/* role="alert": layar ini menggantikan konten tanpa diminta, jadi
          kemunculannya harus diumumkan, bukan ditemukan sendiri. */}
      <div role="alert">
        <h1>{judul}</h1>
        <p>{penjelasan}</p>
      </div>

      {/*
        `location.reload()`, bukan navigasi router: keadaan aplikasi sudah
        terbukti rusak, dan memuat ulang penuh adalah satu-satunya cara yang
        pasti membersihkannya. Router bisa saja gagal lagi dengan cara yang
        sama.

        <button>, bukan <a>: ini menjalankan aksi, bukan berpindah alamat.
        Perbedaannya nyata bagi screen reader — "tombol" dan "tautan" menuntut
        harapan yang berbeda.
      */}
      <button type="button" onClick={() => window.location.reload()}>
        Muat ulang halaman
      </button>

      {/*
        Detail teknis SENGAJA tidak ditampilkan — tidak ada jejak tumpukan,
        tidak ada pesan asli. Ia tidak berguna bagi pengguna dan bisa memuat
        jalur berkas internal atau potongan data. Pengirimannya ke backend
        observability adalah PR-103.
      */}
    </main>
  );
}
