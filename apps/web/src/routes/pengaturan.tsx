// Kerangka halaman "/pengaturan" (PR-033a) — Scope PR-033: "Settings layout +
// navigasi".
//
// ROUTE TERLINDUNGI PERTAMA DI APLIKASI INI. `Terlindungi` lahir di PR-030a
// lengkap dengan test-nya, tetapi sampai sekarang tidak satu pun route memakai
// nya — guard yang teruji tanpa pemakai adalah guard yang belum pernah
// membuktikan diri di jalur nyata. Di sinilah ia dipasang.
//
// `Terlindungi` dipasang DI SINI, di komponen layout, bukan di `routes.ts`:
// berkas itu sengaja `.ts` murni data tanpa satu pun markup (lihat catatannya),
// dan membungkus route dengan elemen JSX akan memaksanya menjadi `.tsx`.
// Memasangnya di induk juga berarti setiap panel yang ditambahkan kelak ikut
// terjaga tanpa perlu mengingatnya — panel yang lupa dijaga tidak menimbulkan
// gejala apa pun sampai seseorang membuka alamatnya tanpa sesi.
//
// `<main>` TIDAK ditulis di sini: landmark utama milik `TataLetak` (PR-032a),
// satu untuk seluruh aplikasi.
import { NavLink, Outlet } from "react-router";
import { gabungKelas } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";

/**
 * Panel pengaturan sebagai DATA.
 *
 * `end` hanya untuk panel indeks: tanpa itu, tautan "/pengaturan" akan tampak
 * aktif di SETIAP panel — karena setiap alamat panel diawali "/pengaturan" —
 * dan `aria-current="page"` yang menempel di dua tautan sekaligus memberi
 * pengguna screen reader dua jawaban berbeda atas pertanyaan "saya di mana".
 */
const PANEL = [
  { ke: "/pengaturan", kunci: "pengaturan.nav.akun", tepat: true },
  { ke: "/pengaturan/aksesibilitas", kunci: "pengaturan.nav.aksesibilitas", tepat: false },
] as const;

export function Pengaturan() {
  const t = useTeks();

  return (
    <Terlindungi>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
        {/*
          `break-words`: pada 320 px dengan `textScale: 200`, kata "Pengaturan"
          sendirian lebih lebar daripada layarnya (scrollWidth 341 vs 320) dan
          memaksa seluruh halaman menggeser mendatar. WCAG 1.4.10 (Reflow)
          mengukur pada 320 px, dan teks 200% adalah 1.4.4 — keduanya dituntut
          bersamaan oleh pengguna yang sama. Memecah kata adalah harga yang jauh
          lebih murah daripada halaman yang harus digeser dua arah.
        */}
        <h1 className="text-3xl font-bold break-words text-gray-900">{t("pengaturan.judul")}</h1>

        {/*
          `<nav>` ber-`aria-label`, sebab halaman ini punya lebih dari satu
          navigasi bila dihitung bersama kerangka aplikasi. Landmark navigasi
          tanpa nama muncul di daftar landmark screen reader sebagai "navigation"
          — tidak bisa dibedakan satu sama lain.
        */}
        <nav aria-label={t("pengaturan.nav.label")}>
          {/*
            <ul>: jumlah panelnya diumumkan lebih dulu ("daftar, 2 item"),
            sehingga pengguna tahu seberapa panjang navigasinya sebelum
            menyusurinya.
          */}
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {PANEL.map(({ ke, kunci, tepat }) => (
              <li key={ke}>
                <NavLink
                  to={ke}
                  end={tepat}
                  className={({ isActive }) =>
                    gabungKelas(
                      "inline-flex min-h-sentuh items-center rounded-md border px-4 text-base",
                      // Panel aktif dibedakan warna DAN tebal huruf. Warna
                      // sendirian melanggar WCAG 1.4.1 (jangan bergantung pada
                      // warna saja); `aria-current` yang ditulis NavLink
                      // menutup sisi screen reader-nya.
                      isActive
                        ? "border-gray-900 bg-gray-900 font-semibold text-white"
                        : "border-gray-400 font-normal text-gray-900",
                    )
                  }
                >
                  {t(kunci)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <Outlet />
      </div>
    </Terlindungi>
  );
}
