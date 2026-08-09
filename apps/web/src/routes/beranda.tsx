// Halaman "/" — landing publik (PR-032a). Menutup AC PR-032 nomor 2, 3, dan
// bagian ke-032a dari nomor 1 & 5.
//
// TANPA GAMBAR, dan itu keputusan, bukan kekurangan. AC 1 menuntut Lighthouse
// perf ≥ 80 pada throttling 3G — dan pada 3G, satu foto hero adalah selisih
// antara halaman yang terbaca dalam dua detik dan halaman yang masih kosong di
// detik kesepuluh. Pengguna yang dituju produk ini justru yang paling mungkin
// berada di jaringan seperti itu. Ilustrasi boleh masuk kelak, tetapi ia harus
// membayar tempatnya sendiri di anggaran, bukan diselundupkan sebagai "aset
// pemasaran".
//
// `<main>` TIDAK ditulis di sini: landmark utama milik `TataLetak`, satu untuk
// seluruh aplikasi.
import { Link } from "react-router";
import { Kartu } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";

/**
 * Nilai produk sebagai DATA, bukan tiga blok JSX yang disalin.
 *
 * Salinan JSX menyimpang: yang ketiga lupa tingkat headingnya, atau memakai
 * kelas yang sedikit berbeda, dan tidak ada yang menyadarinya karena ketiganya
 * tampak "kurang lebih sama".
 */
const NILAI = [
  { kunci: "cocok" },
  { kunci: "terbuka" },
  { kunci: "menyesuaikan" },
] as const;

const LANGKAH = ["beranda.cara.satu", "beranda.cara.dua", "beranda.cara.tiga"] as const;

export function Beranda() {
  const t = useTeks();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("beranda.hero.judul") }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 p-4">
      {/*
        HERO. Satu `<h1>` untuk seluruh halaman — nama merek TIDAK dipakai
        sebagai h1: judul tingkat satu adalah kalimat yang menjawab "halaman ini
        soal apa", dan "Nawasena" tidak menjawabnya bagi orang yang baru pertama
        mendengarnya.
      */}
      <section className="flex flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          {t("shell.merek")}
        </p>
        <h1 className="text-3xl font-bold text-gray-900">{t("beranda.hero.judul")}</h1>
        <p className="text-lg text-gray-900">{t("shell.beranda.tagline")}</p>
        <p className="text-base text-gray-900">{t("beranda.hero.penjelasan")}</p>

        {/*
          CTA — AC 3 ("CTA daftar → login/onboarding").

          <Link>, bukan <Tombol onClick={navigate}>: ini BERPINDAH ALAMAT, bukan
          menjalankan aksi. Bedanya nyata bagi pengguna screen reader ("tautan"
          menyiapkan harapan yang berbeda dari "tombol"), dan hanya tautan yang
          bisa dibuka di tab baru, disalin alamatnya, atau ditelusuri perayap
          mesin pencari — ketiganya penting justru untuk halaman akuisisi.

          Ditata seperti tombol, dengan `min-h-sentuh` sehingga tinggi minimalnya
          mengikuti preferensi target sentuh pengguna (PR-026/027).
        */}
        <div className="flex flex-col gap-2">
          <Link
            to="/masuk"
            className="inline-flex min-h-sentuh items-center justify-center rounded-md bg-gray-900 px-6 text-base font-semibold text-white"
          >
            {t("beranda.hero.daftar")}
          </Link>
          <p className="text-sm text-gray-700">{t("beranda.hero.gratis")}</p>
        </div>
      </section>

      {/*
        `aria-labelledby` menyambungkan tiap section ke judulnya, sehingga daftar
        landmark milik screen reader menyebut NAMA bagiannya alih-alih tiga
        "region" yang tidak bisa dibedakan.
      */}
      <section aria-labelledby="nilai-judul" className="flex flex-col gap-4">
        <h2 id="nilai-judul" className="text-2xl font-semibold text-gray-900">
          {t("beranda.nilai.judul")}
        </h2>

        {/*
          <ul>, bukan tiga <div> bersebelahan: screen reader mengumumkan "daftar,
          3 item" lalu memberi nomor tiap butirnya — pengguna tahu ada berapa
          banyak dan di mana ia berada tanpa harus menyusuri semuanya dulu.
        */}
        <ul className="flex list-none flex-col gap-4 p-0">
          {NILAI.map(({ kunci }) => (
            <li key={kunci}>
              <Kartu
                judul={t(`beranda.nilai.${kunci}.judul`)}
                // Tingkat 3 karena kartu ini bersarang di bawah <h2> di atasnya.
                // Tingkatnya diminta di tempat pemakaian justru supaya tidak ada
                // komponen yang menebaknya (PR-028c).
                tingkatJudul={3}
              >
                <p className="text-base text-gray-900">{t(`beranda.nilai.${kunci}.isi`)}</p>
              </Kartu>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cara-judul" className="flex flex-col gap-4">
        <h2 id="cara-judul" className="text-2xl font-semibold text-gray-900">
          {t("beranda.cara.judul")}
        </h2>
        {/* <ol>: urutannya bermakna — langkah dua tidak bisa didahulukan. */}
        <ol className="flex list-decimal flex-col gap-3 pl-6">
          {LANGKAH.map((kunci) => (
            <li key={kunci} className="text-base text-gray-900">
              {t(kunci)}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="penutup-judul" className="flex flex-col gap-4">
        <h2 id="penutup-judul" className="text-2xl font-semibold text-gray-900">
          {t("beranda.penutup.judul")}
        </h2>
        <Link
          to="/masuk"
          className="inline-flex min-h-sentuh items-center justify-center rounded-md border border-gray-900 px-6 text-base font-semibold text-gray-900"
        >
          {t("beranda.penutup.daftar")}
        </Link>
      </section>
    </div>
  );
}
