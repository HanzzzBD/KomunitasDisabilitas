// Daftar lowongan aktif — halaman publik perusahaan (PR-054, Gap G5).
//
// AC PR-054: "Daftar lowongan aktif tertaut ke detail." Tertaut ke
// `/lowongan/:id` SEKARANG, meski halaman detailnya sendiri baru lahir di
// PR-059 — keputusan eksplisit (bukan dugaan): tautan struktural yang benar
// hari ini tidak perlu ditulis ulang nanti, hanya perlu rute tujuannya
// didaftarkan belakangan. Sampai saat itu tautan ini 404 lewat catch-all
// `routes.ts`, sama seperti tautan mana pun ke rute yang belum lahir.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { companiesKeys, getCompanyActiveJobs, type ApiClient } from "@nawasena/api-client";
import type { EmploymentType, JobPublicSummary, WorkMode } from "@nawasena/schemas";
import { Kartu, KeadaanKosong, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { pesanGalatPublik } from "./pesan-galat.js";

const KUNCI_TIPE: Readonly<Record<EmploymentType, KunciTeks>> = {
  full_time: "companies.lowongan.tipe.full_time",
  part_time: "companies.lowongan.tipe.part_time",
  contract: "companies.lowongan.tipe.contract",
  internship: "companies.lowongan.tipe.internship",
  freelance: "companies.lowongan.tipe.freelance",
};

const KUNCI_MODE: Readonly<Record<WorkMode, KunciTeks>> = {
  onsite: "companies.lowongan.mode.onsite",
  hybrid: "companies.lowongan.mode.hybrid",
  remote: "companies.lowongan.mode.remote",
};

function meta(t: (k: KunciTeks) => string, lowongan: JobPublicSummary): string {
  const bagian = [t(KUNCI_TIPE[lowongan.employmentType]), t(KUNCI_MODE[lowongan.workMode])];
  if (lowongan.city !== null) bagian.push(lowongan.city);
  return bagian.join(" • ");
}

export interface DaftarLowonganProps {
  klien: ApiClient;
  companyId: string;
}

export function DaftarLowongan({ klien, companyId }: DaftarLowonganProps) {
  const t = useTeks();

  const lowongan = useQuery({
    queryKey: companiesKeys.activeJobs(companyId),
    queryFn: () => getCompanyActiveJobs(klien, companyId),
  });

  if (lowongan.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-base font-medium text-red-700">{t("companies.lowongan.gagalMuat")}</p>
        <p className="text-base text-gray-900">{pesanGalatPublik(lowongan.error, t)}</p>
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
    <WilayahMemuat memuat={lowongan.isPending} label={t("companies.lowongan.memuat")}>
      {(lowongan.data?.length ?? 0) === 0 ? (
        <KeadaanKosong tingkatJudul={3} judul={t("companies.lowongan.kosong.judul")}>
          {t("companies.lowongan.kosong.penjelasan")}
        </KeadaanKosong>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {lowongan.data?.map((l) => (
            <li key={l.id}>
              <Kartu
                judul={l.title}
                tingkatJudul={3}
                aksi={
                  <Link
                    to={`/lowongan/${l.id}`}
                    aria-label={t("companies.lowongan.lihatLabel", { judul: l.title })}
                    className="text-base font-medium text-gray-900 underline hover:no-underline"
                  >
                    {t("companies.lowongan.lihat")}
                  </Link>
                }
              >
                <p className="text-base text-gray-900">{meta(t, l)}</p>
              </Kartu>
            </li>
          ))}
        </ul>
      )}
    </WilayahMemuat>
  );
}
