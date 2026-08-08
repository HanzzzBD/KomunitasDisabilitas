// Layar kesalahan — AC PR-025: "Error boundary menampilkan pesan sederhana +
// tombol muat ulang".
//
// Menggantikan layar bawaan React Router, yang berbahasa Inggris, menampilkan
// jejak tumpukan, dan menyapa pengembang ("💿 Hey developer 👋"). Bagi pengguna
// yang dituju produk ini, layar itu bukan sekadar jelek: ia tidak bisa dibaca,
// tidak bisa ditindaklanjuti, dan membocorkan jalur berkas internal.
import { isRouteErrorResponse, useRouteError } from "react-router";
import { useTeks, type KunciTeks } from "../shared/i18n/index.js";

/**
 * Kunci pesan per keadaan. Teksnya sendiri tinggal di katalog, dalam dua
 * varian bahasa — yang dipilih di sini hanya KEADAANNYA.
 *
 * Pesan-pesan itu menyebut LANGKAH BERIKUTNYA, bukan penyebab teknis:
 * pengguna tidak bisa berbuat apa pun dengan "500 Internal Server Error".
 */
function kunciUntuk(error: unknown): { judul: KunciTeks; penjelasan: KunciTeks } {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        judul: "shell.kesalahan.takDitemukan.judul",
        penjelasan: "shell.kesalahan.takDitemukan.penjelasan",
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        judul: "shell.kesalahan.perluMasuk.judul",
        penjelasan: "shell.kesalahan.perluMasuk.penjelasan",
      };
    }
  }

  return {
    judul: "shell.kesalahan.umum.judul",
    penjelasan: "shell.kesalahan.umum.penjelasan",
  };
}

export function LayarKesalahan() {
  const error = useRouteError();
  const t = useTeks();
  const { judul, penjelasan } = kunciUntuk(error);

  return (
    // `<main>` supaya halaman kesalahan tetap punya landmark — pengguna screen
    // reader yang melompat ke konten utama tidak boleh mendarat di ketiadaan.
    <main>
      {/* role="alert": layar ini menggantikan konten tanpa diminta, jadi
          kemunculannya harus diumumkan, bukan ditemukan sendiri. */}
      <div role="alert">
        <h1>{t(judul)}</h1>
        <p>{t(penjelasan)}</p>
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
        {t("shell.kesalahan.muatUlang")}
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
