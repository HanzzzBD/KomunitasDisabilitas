// Kerangka yang membungkus SETIAP halaman.
//
// Dipasang sebagai route induk, bukan disalin ke tiap halaman: banner luring
// yang harus diingat setiap halaman adalah banner yang suatu saat akan
// terlupakan di salah satunya. Alasan yang sama kini berlaku untuk DUA hal baru
// (PR-032a): landmark `<main>` dan tautan lompat ke konten.
import { Navigate, Outlet, ScrollRestoration, useLocation, useNavigation } from "react-router";
import { useEffect } from "react";
import { BannerLuring } from "./banner-luring.js";
import { useTeks } from "../shared/i18n/index.js";
import { NavigasiWeb } from "./navigasi-web.js";
import { usePeranSesi } from "../shared/sesi/peran.js";
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

/**
 * Pesan flash dari `PenjagaAdmin` (PR-052) — dibaca lewat `location.state`,
 * bukan lewat query string. Query string bertahan setelah refresh dan
 * disalin ke tautan; state React Router hanya menempel pada SATU entri
 * riwayat, sehingga pesan "Anda ditolak" tidak ikut terbawa saat halaman ini
 * dibagikan atau dimuat ulang.
 */
function PesanAksesDitolak() {
  const lokasi = useLocation();
  const state = lokasi.state as { pesanAkses?: string } | null;
  const pesan = state?.pesanAkses;

  // Dirender bersyarat, bukan disembunyikan CSS: alasan yang sama dengan
  // `BannerLuring` — elemen yang selalu ada lalu di-`display:none` tidak
  // pernah memicu pengumuman `role="alert"`.
  if (pesan === undefined) return null;

  return (
    <div role="alert" className="p-2">
      <p className="text-base font-semibold text-gray-900">{pesan}</p>
    </div>
  );
}

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
  const peran = usePeranSesi();
  const lokasi = useLocation();

  // PAGEVIEW ANALYTICS (PR-082) — di kerangka karena satu-satunya komponen yang
  // dilewati setiap perpindahan halaman. Hanya `pathname` yang diserahkan, dan
  // id di dalamnya dinormalkan sebelum meninggalkan perangkat; query & hash
  // tidak pernah ikut. No-op bila analytics tidak aktif (lihat `analitik.ts`).
  //
  // Dimuat DINAMIS, bukan diimpor: kerangka ini bundel awal, dan skor
  // Lighthouse 3G landing berdiri tepat di ambangnya (U-31) — impor statis
  // menambah 0,5 KB dan menurunkan skor ke 0,75. Pageview fire-and-forget,
  // jadi menunggu satu chunk kecil tidak merugikan apa pun.
  useEffect(() => {
    const path = lokasi.pathname;
    void import("../shared/analitik.js")
      .then((m) => {
        m.trackPageview(path);
      })
      .catch(() => {
        // Chunk gagal dimuat (luring) — analytics diam, aplikasi tidak terganggu.
      });
  }, [lokasi.pathname]);

  // Pemisahan ruang kerja adalah UX. API tetap memeriksa sesi, role, dan
  // kepemilikan data; halaman publik serta setelan bersama tetap terbuka.
  const jalurSeeker =
    lokasi.pathname === "/profil" ||
    lokasi.pathname === "/onboarding" ||
    lokasi.pathname === "/cv" ||
    lokasi.pathname.startsWith("/cv/") ||
    lokasi.pathname === "/lamaran" ||
    lokasi.pathname.startsWith("/lamaran/");
  if (peran === "admin" && (jalurSeeker || lokasi.pathname === "/")) {
    return <Navigate to="/admin" replace />;
  }
  if (peran === "employer" && jalurSeeker) {
    return <Navigate to="/lowongan" replace />;
  }

  const perluOnboarding =
    status === "masuk" &&
    peran !== "admin" &&
    peran !== "employer" &&
    wizardOnboardingAktif() &&
    !JALUR_DIKECUALIKAN.includes(lokasi.pathname) &&
    // Bagian admin memeriksa sesi/peran sendiri. Wizard pencari kerja tidak
    // boleh memotong akses dashboard maupun halaman pengelolaannya.
    lokasi.pathname !== "/admin" &&
    !lokasi.pathname.startsWith("/admin/");

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
    <div className="shell-app">
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

      {/*
        Pesan flash pasca-pengalihan (PR-052) — lihat `PesanAksesDitolak` di
        atas. DI BAWAH tautan lompat: alasan yang sama seperti pintasan
        preferensi di bawah — tautan lompat harus tetap elemen fokusabel
        PERTAMA.
      */}
      <PesanAksesDitolak />

      <NavigasiWeb masuk={status === "masuk"} peran={peran} />

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
      <main id={ID_KONTEN_UTAMA} tabIndex={-1} aria-busy={sedangMemuat} className="shell-main">
        <div
          className={
            lokasi.pathname.startsWith("/admin") ? "shell-page shell-page-admin" : "shell-page"
          }
        >
          {sedangMemuat ? (
            // Teks, bukan animasi berputar: pengguna dengan `prefers-reduced-motion`
            // tetap terlayani, dan teksnya terbaca screen reader apa adanya.
            <p>{t("shell.memuat")}</p>
          ) : null}
          <Outlet />
        </div>
      </main>
      <footer className="shell-footer text-sm">
        <span>{t("shell.merek")}</span>
        <span>{t("shell.beranda.tagline")}</span>
      </footer>

      {/*
        SCROLL RESTORATION (PR-059) — dipasang di kerangka, SEKALI, dengan
        alasan yang sama seperti `<main>`: satu-satunya komponen yang dilewati
        setiap halaman. Navigasi BARU mulai dari atas (tanpa ini, membuka detail
        lowongan dari daftar yang sudah digulir mendaratkan pengguna di tengah
        halaman detail, melewati `<h1>`-nya); tombol KEMBALI memulihkan posisi
        gulir entri riwayat itu (AC PR-059 "kembali ke list → posisi scroll
        pulih"). Tautan lompat `#konten-utama` tetap bekerja: alamat dengan
        hash diarahkan ke elemennya, bukan ke atas.
      */}
      <ScrollRestoration />
    </div>
  );
}
