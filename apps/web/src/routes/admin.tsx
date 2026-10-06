// Kerangka halaman "/admin" (PR-052) — Scope: "Shell + navigasi + guard".
//
// KEDUA PENJAGA DIPASANG DI SINI, bukan di `routes.ts`: berkas itu sengaja
// `.ts` murni data tanpa satu pun markup (lihat catatannya), dan membungkus
// route dengan elemen JSX akan memaksanya menjadi `.tsx`. `Terlindungi`
// (sesi) di LUAR, `PenjagaAdmin` (peran) di DALAM — urutan itu bukan gaya:
// memeriksa peran sebelum ada sesi sama sekali tidak berarti apa-apa (`/me`
// akan gagal 401 sebelum sempat menjawab peran).
//
// ROUTE `role("admin")` PERTAMA DI APLIKASI INI. Array `SEKSI`, bukan tautan
// tunggal ditulis tangan, supaya PR berikutnya (057/077/081/083/085) menambah
// baris, bukan menulis ulang pola navigasinya (sama seperti `PANEL` di
// `pengaturan.tsx`). PR-053 menambah entri KEDUA — "Perusahaan".
//
// `<main>` TIDAK ditulis di sini: landmark utama milik `TataLetak`, satu
// untuk seluruh aplikasi.
import { Link, NavLink, Outlet } from "react-router";
import { gabungKelas, Kartu } from "@nawasena/ui";
import { useKlienApi } from "../app/klien-api.js";
import { DasborMetrik } from "../features/admin/metrik-dasbor.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";
import { PenjagaAdmin } from "../shared/rute/penjaga-admin.js";
import { KeluarAkun } from "../app/keluar-akun.js";

const SEKSI = [
  { ke: "/admin", kunci: "admin.nav.ringkasan", tepat: true },
  { ke: "/admin/jobs", kunci: "admin.nav.jobs", tepat: false },
  { ke: "/admin/companies", kunci: "admin.nav.companies", tepat: false },
  { ke: "/admin/lamaran", kunci: "admin.nav.lamaran", tepat: false },
  { ke: "/admin/pengguna", kunci: "admin.nav.pengguna", tepat: false },
  { ke: "/admin/community/laporan", kunci: "admin.nav.moderasi", tepat: false },
  { ke: "/admin/analytics", kunci: "admin.nav.analytics", tepat: false },
] as const;

/**
 * Panel ringkasan — satu kartu tautan per bagian admin. HANYA satu bagian
 * hari ini ("Perusahaan", PR-053); PR-057/077/081/083/085 menambah kartu, tidak
 * menulis ulang panel ini.
 */
export function AdminRingkasan() {
  const t = useTeks();
  const klien = useKlienApi();

  return (
    <div className="flex flex-col gap-10">
      {/* PR-081 — metrik pilot DI ATAS kartu tautan (keputusan owner 2026-10-02). */}
      <DasborMetrik klien={klien} />
      <section aria-labelledby="admin-ringkasan-judul" className="flex flex-col gap-4">
        <h2 id="admin-ringkasan-judul" className="text-2xl font-semibold text-gray-900">
          {t("admin.ringkasan.judul")}
        </h2>
        <p className="text-base text-gray-900">{t("admin.ringkasan.penjelasan")}</p>

        <ul className="admin-shortcuts">
          <li>
            <Kartu
              judul={t("admin.community.judul")}
              tingkatJudul={3}
              aksi={
                <Link
                  to="/admin/community"
                  className="inline-flex min-h-sentuh items-center rounded-md border border-gray-900 px-4 text-base font-semibold text-gray-900"
                >
                  {t("admin.nav.community")}
                </Link>
              }
            >
              <p className="text-base text-gray-900">{t("admin.community.queue")}</p>
            </Kartu>
          </li>
          <li>
            <Kartu
              judul={t("admin.ringkasan.companies.judul")}
              tingkatJudul={3}
              aksi={
                <Link
                  to="/admin/companies"
                  className="inline-flex min-h-sentuh items-center rounded-md border border-gray-900 px-4 text-base font-semibold text-gray-900"
                >
                  {t("admin.ringkasan.companies.tautan")}
                </Link>
              }
            >
              <p className="text-base text-gray-900">{t("admin.ringkasan.companies.penjelasan")}</p>
            </Kartu>
          </li>
          <li>
            <Kartu
              judul={t("admin.ringkasan.jobs.judul")}
              tingkatJudul={3}
              aksi={
                <Link
                  to="/admin/jobs"
                  className="inline-flex min-h-sentuh items-center rounded-md border border-gray-900 px-4 text-base font-semibold text-gray-900"
                >
                  {t("admin.ringkasan.jobs.tautan")}
                </Link>
              }
            >
              <p className="text-base text-gray-900">{t("admin.ringkasan.jobs.penjelasan")}</p>
            </Kartu>
          </li>
          <li>
            <Kartu
              judul={t("admin.ringkasan.lamaran.judul")}
              tingkatJudul={3}
              aksi={
                <Link
                  to="/admin/lamaran"
                  className="inline-flex min-h-sentuh items-center rounded-md border border-gray-900 px-4 text-base font-semibold text-gray-900"
                >
                  {t("admin.ringkasan.lamaran.tautan")}
                </Link>
              }
            >
              <p className="text-base text-gray-900">{t("admin.ringkasan.lamaran.penjelasan")}</p>
            </Kartu>
          </li>
          <li>
            <Kartu
              judul={t("admin.ringkasan.pengguna.judul")}
              tingkatJudul={3}
              aksi={
                <Link
                  to="/admin/pengguna"
                  className="inline-flex min-h-sentuh items-center rounded-md border border-gray-900 px-4 text-base font-semibold text-gray-900"
                >
                  {t("admin.ringkasan.pengguna.tautan")}
                </Link>
              }
            >
              <p className="text-base text-gray-900">{t("admin.ringkasan.pengguna.penjelasan")}</p>
            </Kartu>
          </li>
          <li>
            <Kartu
              judul={t("admin.ringkasan.kamus.judul")}
              tingkatJudul={3}
              aksi={
                <Link
                  to="/admin/kamus"
                  className="inline-flex min-h-sentuh items-center rounded-md border border-gray-900 px-4 text-base font-semibold text-gray-900"
                >
                  {t("admin.ringkasan.kamus.tautan")}
                </Link>
              }
            >
              <p className="text-base text-gray-900">{t("admin.ringkasan.kamus.penjelasan")}</p>
            </Kartu>
          </li>
        </ul>
      </section>
    </div>
  );
}

export function Admin() {
  const t = useTeks();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("admin.judul") }));

  return (
    <Terlindungi>
      <PenjagaAdmin>
        <div className="admin-workspace">
          <h1 className="workspace-title text-3xl font-bold break-words text-gray-900">
            {t("admin.judul")}
          </h1>
          <aside className="admin-sidebar">
            {/*
            `<nav>` ber-`aria-label`: halaman ini punya lebih dari satu
            navigasi bila dihitung bersama kerangka aplikasi (AC "Navigasi
            admin keyboard-only" — pola dan aksesibilitasnya identik dengan
            `pengaturan.tsx`, yang sudah terbukti keyboard-only sejak PR-033a).
          */}
            <nav aria-label={t("admin.nav.label")}>
              <ul className="admin-menu">
                {SEKSI.map(({ ke, kunci, tepat }) => (
                  <li key={ke}>
                    <NavLink
                      to={ke}
                      end={tepat}
                      className={({ isActive }) =>
                        gabungKelas(
                          "admin-menu-link text-base",
                          isActive ? "admin-menu-active font-semibold" : "font-normal",
                        )
                      }
                    >
                      {t(kunci)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <nav
              aria-label={t("shell.nav.pendukung")}
              className="mt-6 border-t border-gray-400 pt-4"
            >
              <NavLink to="/admin/kamus" className="admin-menu-link">
                {t("admin.nav.kamus")}
              </NavLink>
              <NavLink to="/admin/community" end className="admin-menu-link">
                {t("admin.nav.community")}
              </NavLink>
            </nav>
            <nav
              aria-label={t("shell.nav.akunMenu")}
              className="mt-6 border-t border-gray-400 pt-4"
            >
              <Link to="/admin/settings" className="admin-menu-link">
                {t("admin.nav.pengaturan")}
              </Link>
              <Link to="/admin/account" className="admin-menu-link">
                {t("admin.nav.profilAkun")}
              </Link>
              <KeluarAkun className="admin-menu-link text-base" />
            </nav>
          </aside>
          <div className="admin-content">
            <Outlet />
          </div>
        </div>
      </PenjagaAdmin>
    </Terlindungi>
  );
}
