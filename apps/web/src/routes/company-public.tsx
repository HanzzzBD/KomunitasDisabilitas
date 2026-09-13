// Halaman "/companies/:id" — profil publik perusahaan (PR-054, Gap G5).
//
// PUBLIK DENGAN SENGAJA, TANPA `<Terlindungi>` — kandidat menilai perusahaan
// SEBELUM melamar, dan seringkali sebelum masuk sama sekali (US-09, sama
// dengan alasan `GET /companies/:id` publik di sisi server).
//
// STRUKTUR HEADING (AC "struktur heading benar; axe pass"):
//   h1 nama perusahaan → h2 "Akomodasi" → h2 "Lowongan aktif" → h3 per
//   lowongan (lewat `Kartu` di `DaftarLowongan`). Tidak ada tingkat yang
//   dilompati.
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ApiError, companiesKeys, getCompanyPublic } from "@nawasena/api-client";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useKlienApi } from "../app/klien-api.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";
import { DaftarAkomodasi } from "../features/companies-publik/akomodasi-daftar.js";
import { DaftarLowongan } from "../features/companies-publik/lowongan-daftar.js";
import { StatusBadgePublik } from "../features/companies-publik/status-badge.js";
import { pesanGalatPublik } from "../features/companies-publik/pesan-galat.js";

export function ProfilPerusahaanPublik() {
  const t = useTeks();
  const klien = useKlienApi();
  const { id } = useParams<{ id: string }>();
  // `id` hanya `undefined` bila komponen ini dirender di luar rute yang
  // mendeklarasikan `:id` — tidak pernah terjadi lewat `app/routes.ts`.
  const companyId = id ?? "";

  const profil = useQuery({
    queryKey: companiesKeys.public(companyId),
    queryFn: () => getCompanyPublic(klien, companyId),
    // MENIMPA bawaan `retry: MAKS_RETRY` (query-client.ts) — hanya untuk kode
    // ini. "Tidak ditemukan" bukan kegagalan sementara yang bisa membaik
    // dicoba ulang; mengulanginya hanya menahan pengguna di layar kerangka
    // selama dua putaran backoff (≈3 detik) sebelum akhirnya menampilkan
    // pesan yang sudah pasti sejak percobaan pertama.
    retry: (jumlahGagal, galat) =>
      galat instanceof ApiError && galat.code === "PERUSAHAAN_TIDAK_DITEMUKAN" ? false : jumlahGagal < 2,
  });

  useJudulHalaman(
    t("shell.judulDokumen", { halaman: profil.data?.name ?? t("companies.memuat") }),
  );

  const tidakDitemukan =
    profil.error instanceof ApiError && profil.error.code === "PERUSAHAAN_TIDAK_DITEMUKAN";

  if (tidakDitemukan) {
    return (
      <div role="alert" className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 p-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          {t("companies.tidakDitemukan.judul")}
        </h1>
        <p className="text-base text-gray-900">{t("companies.tidakDitemukan.penjelasan")}</p>
        <Link to="/" className="text-base font-medium text-gray-900 underline hover:no-underline">
          {t("companies.kembaliBeranda")}
        </Link>
      </div>
    );
  }

  if (profil.isError) {
    return (
      <div role="alert" className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 p-4">
        <p className="text-base font-medium text-red-700">{t("companies.gagalMuat")}</p>
        <p className="text-base text-gray-900">{pesanGalatPublik(profil.error, t)}</p>
        <Tombol
          varian="sekunder"
          onClick={() => {
            void profil.refetch();
          }}
        >
          {t("companies.cobaLagi")}
        </Tombol>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4">
      <WilayahMemuat memuat={profil.isPending} label={t("companies.memuat")}>
        {profil.data !== undefined && (
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{profil.data.name}</h1>
              <StatusBadgePublik status={profil.data.inclusivityStatus} />

              {profil.data.description !== null && (
                <p className="text-base text-gray-900">{profil.data.description}</p>
              )}

              {(profil.data.city !== null || profil.data.website !== null) && (
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-base text-gray-900">
                  {profil.data.city !== null && (
                    <div className="flex gap-1">
                      <dt className="font-medium">{t("companies.info.kotaLabel")}:</dt>
                      <dd className="m-0">{profil.data.city}</dd>
                    </div>
                  )}
                  {profil.data.website !== null && (
                    <div className="flex gap-1">
                      <dt className="font-medium">{t("companies.info.websiteLabel")}:</dt>
                      <dd className="m-0">
                        <a
                          href={profil.data.website}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:no-underline"
                        >
                          {profil.data.website}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </section>

            <section aria-labelledby="companies-akomodasi-judul" className="flex flex-col gap-3">
              <h2 id="companies-akomodasi-judul" className="text-2xl font-semibold text-gray-900">
                {t("companies.akomodasi.judul")}
              </h2>
              <DaftarAkomodasi akomodasi={profil.data.accommodationsAvailable} />
            </section>

            <section aria-labelledby="companies-lowongan-judul" className="flex flex-col gap-3">
              <h2 id="companies-lowongan-judul" className="text-2xl font-semibold text-gray-900">
                {t("companies.lowongan.judul")}
              </h2>
              <DaftarLowongan klien={klien} companyId={companyId} />
            </section>
          </div>
        )}
      </WilayahMemuat>
    </div>
  );
}
