// Detail lowongan publik (PR-059, FR-4.4) — keputusan melamar berdasar
// informasi akomodasi yang lengkap.
//
// STRUKTUR HEADING (AC "H1 jabatan…"): h1 judul lowongan → h2 per bagian
// (ringkasan, deskripsi, persyaratan, akomodasi, terbuka untuk, tentang
// perusahaan, cara melamar) → h3 nama perusahaan → h4 akomodasi perusahaan.
// Tidak ada tingkat yang dilompati.
//
// ANTI-XSS (Security Considerations): deskripsi dan persyaratan hasil kurasi
// dirender sebagai TEKS lewat JSX biasa — React meng-escape isinya. Tidak ada
// `dangerouslySetInnerHTML` di mana pun di fitur ini; baris baru dipertahankan
// lewat `whitespace-pre-line`, bukan dengan mengubah teks jadi HTML.
//
// TAKSONOMI & LABEL DIPINJAM, tidak ditulis ulang: jenis/mode kerja dari
// `kartu-lowongan.tsx` (katalog `companies`), akomodasi lewat
// `DaftarAkomodasi` (katalog `profil`), ragam disabilitas lewat `RAGAM`
// (katalog `onboarding`), badge verifikasi lewat `StatusBadgePublik`.
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  ApiError,
  companiesKeys,
  getCompanyPublic,
  getJobPublic,
  jobsKeys,
  type ApiClient,
} from "@nawasena/api-client";
import type { CompanyPublic, JobPublic } from "@nawasena/schemas";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useJudulHalaman } from "../../shared/judul-halaman.js";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { DaftarAkomodasi } from "../companies-publik/akomodasi-daftar.js";
import { StatusBadgePublik } from "../companies-publik/status-badge.js";
import { RAGAM } from "../onboarding/langkah-ragam-disabilitas.js";
import { kalimatGaji } from "./gaji.js";
import { KUNCI_MODE, KUNCI_TIPE } from "./kartu-lowongan.js";
import { pesanGalatLowongan } from "./pesan-galat.js";

/** Tanggal WIB eksplisit — server menyimpan UTC (alasan sama `notifikasi/daftar.tsx`). */
const TANGGAL = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

/** Sama persis dengan `KUNCI_RAGAM` di `features/profil/bagian-sensitif.tsx`. */
const KUNCI_RAGAM: Readonly<Record<string, KunciTeks>> = Object.fromEntries(
  RAGAM.map((r) => [r.nilai, r.kunci]),
);

function tidakDitemukan(galat: unknown): boolean {
  return galat instanceof ApiError && galat.code === "LOWONGAN_TIDAK_DITEMUKAN";
}

export interface DetailLowonganProps {
  klien: ApiClient;
  jobId: string;
}

export function DetailLowongan({ klien, jobId }: DetailLowonganProps) {
  const t = useTeks();

  const lowongan = useQuery({
    queryKey: jobsKeys.detail(jobId),
    queryFn: () => getJobPublic(klien, jobId),
    // "Tidak ditemukan" bukan kegagalan sementara — mengulanginya hanya
    // menahan pengguna di layar memuat selama putaran backoff (pola sama
    // `routes/company-public.tsx`).
    retry: (jumlahGagal, galat) => (tidakDitemukan(galat) ? false : jumlahGagal < 2),
  });

  const companyId = lowongan.data?.companyId;
  const perusahaan = useQuery({
    queryKey: companiesKeys.public(companyId ?? ""),
    queryFn: () => getCompanyPublic(klien, companyId ?? ""),
    enabled: companyId !== undefined,
  });

  const lowonganHilang = tidakDitemukan(lowongan.error);
  useJudulHalaman(
    t("shell.judulDokumen", {
      halaman: lowonganHilang
        ? t("lowongan.detail.tidakDitemukan.judul")
        : (lowongan.data?.title ?? t("lowongan.memuat")),
    }),
  );

  if (lowonganHilang) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">
          {t("lowongan.detail.tidakDitemukan.judul")}
        </h1>
        <p className="text-base text-gray-900">{t("lowongan.detail.tidakDitemukan.penjelasan")}</p>
      </div>
    );
  }

  if (lowongan.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-base font-medium text-red-700">{t("lowongan.detail.gagalMuat")}</p>
        <p className="text-base text-gray-900">{pesanGalatLowongan(lowongan.error, t)}</p>
        <Tombol
          varian="sekunder"
          onClick={() => {
            void lowongan.refetch();
          }}
        >
          {t("companies.cobaLagi")}
        </Tombol>
      </div>
    );
  }

  return (
    <WilayahMemuat memuat={lowongan.isPending} label={t("lowongan.memuat")}>
      {lowongan.data !== undefined && (
        <IsiDetail
          lowongan={lowongan.data}
          perusahaan={perusahaan.data}
          perusahaanMemuat={perusahaan.isPending}
          perusahaanGagal={perusahaan.isError}
        />
      )}
    </WilayahMemuat>
  );
}

function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="font-semibold">{label}</dt>
      <dd className="m-0 break-words">{children}</dd>
    </div>
  );
}

interface IsiDetailProps {
  lowongan: JobPublic;
  perusahaan: CompanyPublic | undefined;
  perusahaanMemuat: boolean;
  perusahaanGagal: boolean;
}

const KELAS_H2 = "text-2xl font-semibold text-gray-900";
const KELAS_TEKS = "text-base text-gray-900";

function IsiDetail({ lowongan, perusahaan, perusahaanMemuat, perusahaanGagal }: IsiDetailProps) {
  const t = useTeks();
  const lokasi = [lowongan.city, lowongan.province].filter((v): v is string => v !== null);
  const gaji = kalimatGaji(t, lowongan.salaryMin, lowongan.salaryMax);

  return (
    <article aria-labelledby="lowongan-detail-judul" className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 id="lowongan-detail-judul" className="text-3xl font-bold break-words text-gray-900">
          {lowongan.title}
        </h1>
        {perusahaan !== undefined && (
          <p className="text-lg break-words text-gray-900">{perusahaan.name}</p>
        )}
      </header>

      <section aria-labelledby="lowongan-detail-ringkasan" className="flex flex-col gap-3">
        <h2 id="lowongan-detail-ringkasan" className={KELAS_H2}>
          {t("lowongan.detail.ringkasan")}
        </h2>
        <dl className={`m-0 flex flex-col gap-2 ${KELAS_TEKS}`}>
          <Baris label={t("lowongan.detail.info.jenis")}>
            {t(KUNCI_TIPE[lowongan.employmentType])}
          </Baris>
          <Baris label={t("lowongan.detail.info.mode")}>{t(KUNCI_MODE[lowongan.workMode])}</Baris>
          <Baris label={t("lowongan.detail.info.lokasi")}>
            {lokasi.length > 0 ? lokasi.join(", ") : t("lowongan.kartu.lokasiTakDisebut")}
          </Baris>
          {gaji !== null && <Baris label={t("lowongan.detail.info.gaji")}>{gaji}</Baris>}
          {lowongan.publishedAt !== null && (
            <Baris label={t("lowongan.detail.info.diterbitkan")}>
              <time dateTime={lowongan.publishedAt}>
                {TANGGAL.format(new Date(lowongan.publishedAt))}
              </time>
            </Baris>
          )}
          {lowongan.expiresAt !== null && (
            <Baris label={t("lowongan.detail.info.batas")}>
              <time dateTime={lowongan.expiresAt}>
                {TANGGAL.format(new Date(lowongan.expiresAt))}
              </time>
            </Baris>
          )}
        </dl>
      </section>

      <section aria-labelledby="lowongan-detail-deskripsi" className="flex flex-col gap-3">
        <h2 id="lowongan-detail-deskripsi" className={KELAS_H2}>
          {t("lowongan.detail.deskripsi")}
        </h2>
        <p className={`whitespace-pre-line break-words ${KELAS_TEKS}`}>{lowongan.description}</p>
      </section>

      {lowongan.requirements !== null && (
        <section aria-labelledby="lowongan-detail-persyaratan" className="flex flex-col gap-3">
          <h2 id="lowongan-detail-persyaratan" className={KELAS_H2}>
            {t("lowongan.detail.persyaratan")}
          </h2>
          <p className={`whitespace-pre-line break-words ${KELAS_TEKS}`}>{lowongan.requirements}</p>
        </section>
      )}

      <section aria-labelledby="lowongan-detail-akomodasi" className="flex flex-col gap-3">
        <h2 id="lowongan-detail-akomodasi" className={KELAS_H2}>
          {t("lowongan.detail.akomodasi")}
        </h2>
        {lowongan.accommodations.length > 0 ? (
          <DaftarAkomodasi akomodasi={lowongan.accommodations} />
        ) : (
          <p className={KELAS_TEKS}>{t("lowongan.kartu.akomodasiKosong")}</p>
        )}
      </section>

      <section aria-labelledby="lowongan-detail-ragam" className="flex flex-col gap-3">
        <h2 id="lowongan-detail-ragam" className={KELAS_H2}>
          {t("lowongan.detail.ragam.judul")}
        </h2>
        {lowongan.welcomedDisabilityTypes.length > 0 ? (
          <ul className={`m-0 flex list-disc flex-col gap-1 pl-6 ${KELAS_TEKS}`}>
            {lowongan.welcomedDisabilityTypes.map((ragam) => (
              <li key={ragam}>{t(KUNCI_RAGAM[ragam] ?? "lowongan.detail.ragam.judul")}</li>
            ))}
          </ul>
        ) : (
          <p className={KELAS_TEKS}>{t("lowongan.detail.ragam.semua")}</p>
        )}
      </section>

      <section aria-labelledby="lowongan-detail-perusahaan" className="flex flex-col gap-3">
        <h2 id="lowongan-detail-perusahaan" className={KELAS_H2}>
          {t("lowongan.detail.perusahaan.judul")}
        </h2>
        {perusahaanGagal ? (
          <p role="alert" className={KELAS_TEKS}>
            {t("lowongan.detail.perusahaan.gagalMuat")}
          </p>
        ) : (
          <WilayahMemuat memuat={perusahaanMemuat} label={t("companies.memuat")}>
            {perusahaan !== undefined && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xl font-semibold break-words text-gray-900">
                  {perusahaan.name}
                </h3>
                <StatusBadgePublik status={perusahaan.inclusivityStatus} />
                <h4 className="text-base font-semibold text-gray-900">
                  {t("lowongan.detail.perusahaan.akomodasi")}
                </h4>
                <DaftarAkomodasi akomodasi={perusahaan.accommodationsAvailable} />
                <Link
                  to={`/companies/${perusahaan.id}`}
                  className="text-base font-medium break-words text-gray-900 underline hover:no-underline"
                >
                  {t("lowongan.detail.perusahaan.lihatProfil", { nama: perusahaan.name })}
                </Link>
              </div>
            )}
          </WilayahMemuat>
        )}
      </section>

      <section aria-labelledby="lowongan-detail-melamar" className="flex flex-col gap-3">
        <h2 id="lowongan-detail-melamar" className={KELAS_H2}>
          {t("lowongan.detail.melamar.judul")}
        </h2>
        <p className={KELAS_TEKS}>{t("lowongan.detail.melamar.penjelasan")}</p>
      </section>
    </article>
  );
}
