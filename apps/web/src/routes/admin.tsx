// Kerangka halaman "/admin" (PR-052) — Scope: "Shell + navigasi + guard".
//
// KEDUA PENJAGA DIPASANG DI SINI, bukan di `routes.ts`: berkas itu sengaja
// `.ts` murni data tanpa satu pun markup (lihat catatannya), dan membungkus
// route dengan elemen JSX akan memaksanya menjadi `.tsx`. `Terlindungi`
// (sesi) di LUAR, `PenjagaAdmin` (peran) di DALAM — urutan itu bukan gaya:
// memeriksa peran sebelum ada sesi sama sekali tidak berarti apa-apa (`/me`
// akan gagal 401 sebelum sempat menjawab peran).
//
// ROUTE `role("admin")` PERTAMA DI APLIKASI INI. Belum ada modul admin lain
// (companies/jobs menyusul PR-053/055 dst.), jadi navigasinya baru memuat
// SATU entri — indeksnya sendiri. Array `SEKSI`, bukan tautan tunggal
// ditulis tangan, supaya PR berikutnya menambah baris, bukan menulis ulang
// pola navigasinya (sama seperti `PANEL` di `pengaturan.tsx`).
//
// `<main>` TIDAK ditulis di sini: landmark utama milik `TataLetak`, satu
// untuk seluruh aplikasi.
import { NavLink, Outlet } from "react-router";
import { gabungKelas, KeadaanKosong } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";
import { PenjagaAdmin } from "../shared/rute/penjaga-admin.js";

const SEKSI = [{ ke: "/admin", kunci: "admin.nav.ringkasan", tepat: true }] as const;

export function AdminRingkasan() {
  const t = useTeks();

  return (
    <section aria-labelledby="admin-ringkasan-judul" className="flex flex-col gap-4">
      <h2 id="admin-ringkasan-judul" className="text-2xl font-semibold text-gray-900">
        {t("admin.ringkasan.judul")}
      </h2>
      <KeadaanKosong judul={t("admin.ringkasan.kosong.judul")} tingkatJudul={3}>
        <p>{t("admin.ringkasan.kosong.penjelasan")}</p>
      </KeadaanKosong>
    </section>
  );
}

export function Admin() {
  const t = useTeks();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("admin.judul") }));

  return (
    <Terlindungi>
      <PenjagaAdmin>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
          <h1 className="text-3xl font-bold break-words text-gray-900">{t("admin.judul")}</h1>

          {/*
            `<nav>` ber-`aria-label`: halaman ini punya lebih dari satu
            navigasi bila dihitung bersama kerangka aplikasi (AC "Navigasi
            admin keyboard-only" — pola dan aksesibilitasnya identik dengan
            `pengaturan.tsx`, yang sudah terbukti keyboard-only sejak PR-033a).
          */}
          <nav aria-label={t("admin.nav.label")}>
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {SEKSI.map(({ ke, kunci, tepat }) => (
                <li key={ke}>
                  <NavLink
                    to={ke}
                    end={tepat}
                    className={({ isActive }) =>
                      gabungKelas(
                        "inline-flex min-h-sentuh items-center rounded-md border px-4 text-base",
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
      </PenjagaAdmin>
    </Terlindungi>
  );
}
