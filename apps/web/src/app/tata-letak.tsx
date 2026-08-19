// Kerangka yang membungkus SETIAP halaman.
//
// Dipasang sebagai route induk, bukan disalin ke tiap halaman: banner luring
// yang harus diingat setiap halaman adalah banner yang suatu saat akan
// terlupakan di salah satunya. Alasan yang sama kini berlaku untuk DUA hal baru
// (PR-032a): landmark `<main>` dan tautan lompat ke konten.
import { Navigate, Outlet, useLocation, useNavigation } from "react-router";
import { BannerLuring } from "./banner-luring.js";
import { useTeks } from "../shared/i18n/index.js";
import { useStoreSesi } from "../shared/sesi/store.js";
import {
  idPenggunaSaatIni,
  sudahOnboarding,
  wizardOnboardingAktif,
} from "../features/onboarding/index.js";

/**
 * Id sasaran tautan lompat. Diekspor supaya test dan halaman lain menyebut
 * nilai yang SAMA — id yang diketik ulang di dua tempat adalah id yang suatu
 * saat berbeda satu huruf, dan tautan lompat yang menunjuk elemen tidak ada
 * gagal tanpa satu pun gejala yang terlihat di layar.
 */
export const ID_KONTEN_UTAMA = "konten-utama";

/**
 * Alamat yang TIDAK BOLEH dialihkan ke onboarding, apa pun keadaan sesinya.
 *
 * Daftar ini bukan optimasi — ia syarat kebenaran, dan `/masuk/google` adalah
 * alasan utamanya. Halaman itu menukarkan authorization code segera setelah
 * dimuat; mengalihkannya di tengah proses berarti penukaran tidak pernah
 * selesai dan pengguna tidak pernah benar-benar masuk. Gejalanya menyesatkan:
 * ia mendarat di wizard onboarding, jadi tampak "berhasil masuk" — sampai
 * permintaan pertama ditolak.
 *
 * `useLocation().pathname` TIDAK memuat query string, jadi
 * `/masuk/google?code=…&state=…` tetap cocok dengan entri di bawah. Ini
 * ketergantungan yang halus dan dijaga test khusus (`tata-letak.test.tsx`,
 * "regresi kembalian Google").
 *
 * `/masuk/google` juga alamat kembalian alur KONFIRMASI HAPUS AKUN (PR-033c-2,
 * `MaksudOAuth`) — satu entri menutup keduanya, sebab keduanya memang memakai
 * alamat yang sama persis.
 */
const JALUR_DIKECUALIKAN: readonly string[] = ["/onboarding", "/masuk", "/masuk/google"];

export function TataLetak() {
  const t = useTeks();

  // Route dimuat lazy, jadi berpindah halaman memakan waktu yang bisa terasa
  // di jaringan lambat. Tanpa penanda, layar tampak beku dan pengguna menekan
  // tautannya berulang kali.
  const sedangMemuat = useNavigation().state !== "idle";

  // PEMICU ONBOARDING (PR-035), dipasang di kerangka dengan alasan yang sama
  // seperti banner luring: satu-satunya komponen yang dilewati SETIAP halaman.
  //
  // Bukan di `Terlindungi`: guard itu hanya dipasang halaman yang memintanya
  // (hari ini cuma `/pengaturan`), sementara pengguna yang baru mendaftar
  // mendarat di `/` — yaitu halaman publik yang tidak memakai guard sama
  // sekali. Menaruh pemicunya di sana berarti melewatkan justru kasus yang
  // paling penting.
  //
  // Berlangganan HANYA `status`; lihat catatan yang sama di `Terlindungi`.
  const status = useStoreSesi((s) => s.status);
  const lokasi = useLocation();

  const perluOnboarding =
    status === "masuk" && wizardOnboardingAktif() && !JALUR_DIKECUALIKAN.includes(lokasi.pathname);

  if (perluOnboarding) {
    const sub = idPenggunaSaatIni();
    // `sub` null (tidak ada token, atau tokennya tidak bisa dibaca) berarti
    // TIDAK mengalihkan. Memperlakukannya sebagai "pengguna baru" akan
    // mengirim orang ke wizard yang penandanya tidak pernah bisa ditulis —
    // yaitu pengalihan yang berulang selamanya.
    if (sub !== null && !sudahOnboarding(sub)) {
      // `replace`, BUKAN push: alasan yang sama dengan `Terlindungi` — halaman
      // yang ditinggalkan tidak boleh tertinggal di riwayat sebagai jebakan
      // tombol kembali.
      return <Navigate to="/onboarding" replace />;
    }
  }

  return (
    <>
      {/*
        TAUTAN LOMPAT — elemen fokusabel PERTAMA di dokumen, dan itu keseluruhan
        gunanya. Pengguna keyboard yang mendarat di halaman berisi navigasi
        panjang harus menekan Tab belasan kali sebelum sampai ke isi; ditaruh di
        urutan kedua, tautan ini tidak menyelesaikan apa pun.

        `sr-only focus:not-sr-only`: TERSEMBUNYI SECARA VISUAL, tetapi tetap ada
        di pohon aksesibilitas dan tetap bisa difokus. `display:none` maupun
        `hidden` akan mengeluarkannya dari urutan Tab — yaitu menghapus fungsinya
        sambil menyisakan markupnya.

        <a href="#…> biasa, BUKAN <Link>: React Router akan menganggapnya
        perpindahan route dan menelan perilaku bawaan peramban (menggulir ke
        sasaran + memindahkan fokus ke sana). Yang dibutuhkan di sini justru
        perilaku bawaan itu.
      */}
      <a
        href={`#${ID_KONTEN_UTAMA}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:border focus:border-gray-900 focus:bg-white focus:px-4 focus:py-3 focus:text-base focus:font-semibold focus:text-gray-900"
      >
        {t("shell.lompatKeKonten")}
      </a>

      <BannerLuring />

      {/*
        SATU-SATUNYA `<main>` di aplikasi. Halaman TIDAK boleh membuat `<main>`
        sendiri: dua landmark utama membuat perintah "lompat ke konten utama"
        milik screen reader menjadi ambigu, dan yang kedua biasanya lahir
        belakangan tanpa siapa pun menyadarinya. Dijaga `tata-letak.test.tsx`.

        `tabIndex={-1}` BUKAN hiasan: sebagian peramban hanya menggulir ke
        sasaran tautan lompat tanpa memindahkan fokus ke sana bila sasarannya
        tidak fokusabel. Akibatnya penekanan Tab berikutnya melanjutkan dari
        tautan lompat — pengguna melihat isi halaman, tetapi fokusnya masih di
        atas, dan ia harus menyusuri seluruh halaman lagi.

        `aria-busy` pada wilayah yang SEDANG berubah. Ia memberi tahu screen
        reader bahwa isi di dalamnya belum final, sehingga pembacaannya tidak
        dimulai di tengah pergantian konten.
      */}
      <main id={ID_KONTEN_UTAMA} tabIndex={-1} aria-busy={sedangMemuat}>
        {sedangMemuat ? (
          // Teks, bukan animasi berputar: pengguna dengan `prefers-reduced-motion`
          // tetap terlayani, dan teksnya terbaca screen reader apa adanya.
          <p>{t("shell.memuat")}</p>
        ) : null}
        <Outlet />
      </main>
    </>
  );
}
