// Daftar lamaran admin (PR-077b) — AC "Filter per lowongan/status bekerja" dan
// "Bulk view performa wajar (pagination)".
//
// FILTER DI SERVER, BUKAN DI KLIEN. Berbeda dari daftar lowongan/perusahaan
// (tanpa pagination, skala pilot), lamaran bisa ratusan per lowongan: saringan
// klien atas halaman pertama saja akan menyembunyikan lamaran di halaman lain
// tanpa tanda. `job_id`/`status` karena itu ikut ke query key — ganti saringan
// = daftar baru dari halaman pertama.
//
// "MUAT LEBIH BANYAK", BUKAN GULIR TAK BERUJUNG (keputusan owner 2026-10-02):
// tombol bisa dicapai keyboard, tidak memindahkan fokus diam-diam, dan tidak
// membuat footer mustahil dicapai (persona Sari & Dimas). Jumlah yang tampil
// diumumkan lewat `role="status"` sesudah halaman berikutnya masuk.
//
// DATA DISABILITAS TIDAK ADA DI SINI — kolom "Data disabilitas" hanya menyebut
// APAKAH pelamar mengungkapnya. Isinya hanya bisa dibuka di detail, dengan alasan.
import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  applicationsKeys,
  jobsKeys,
  listApplicationsAdmin,
  listJobsAdmin,
  type ApiClient,
} from "@nawasena/api-client";
import {
  applicationStatusSchema,
  type AdminApplication,
  type ApplicationStatus,
} from "@nawasena/schemas";
import {
  KolomForm,
  KotakCentang,
  Pilihan,
  Tabel,
  Tombol,
  WilayahMemuat,
  type KolomTabel,
} from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { KUNCI_STATUS_LAMARAN, LamaranStatusBadge } from "./lamaran-status-badge.js";
import { pesanGalatLamaran } from "./lamaran-pesan-galat.js";

const SEMUA = "semua";
const PER_HALAMAN = 50;

/** Tanggal WIB eksplisit — alasan sama dengan `pengaturan-akun.tsx`. */
export const TANGGAL_LAMARAN = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export function DaftarLamaran({ klien }: { klien: ApiClient }) {
  const t = useTeks();
  const [status, setStatus] = useState<string>(SEMUA);
  const [jobId, setJobId] = useState<string>(SEMUA);
  // PR-083 — lamaran dari akun DITANGGUHKAN disembunyikan bawaan.
  const [termasukDitangguhkan, setTermasukDitangguhkan] = useState(false);

  const filter = {
    status: status === SEMUA ? undefined : (status as ApplicationStatus),
    jobId: jobId === SEMUA ? undefined : jobId,
    termasukDitangguhkan,
  };

  const daftar = useInfiniteQuery({
    queryKey: applicationsKeys.adminList(filter),
    queryFn: ({ pageParam }) =>
      listApplicationsAdmin(klien, { ...filter, cursor: pageParam, limit: PER_HALAMAN }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (halaman) => halaman.meta.nextCursor ?? undefined,
  });

  // Pilihan lowongan untuk saringan — cache yang SAMA dengan `/admin/jobs`.
  const lowongan = useQuery({
    queryKey: jobsKeys.adminList(),
    queryFn: () => listJobsAdmin(klien),
  });

  const data = useMemo(() => daftar.data?.pages.flatMap((h) => h.data) ?? [], [daftar.data]);

  const kolom: ReadonlyArray<KolomTabel<AdminApplication>> = [
    {
      kunci: "applicant",
      label: t("admin.lamaran.kolom.pelamar"),
      render: (l) => l.applicant.fullName ?? t("admin.lamaran.akunDihapus"),
    },
    {
      kunci: "job",
      label: t("admin.lamaran.kolom.lowongan"),
      render: (l) => l.job?.title ?? t("admin.lamaran.lowonganTakDikenal"),
    },
    {
      kunci: "status",
      label: t("admin.lamaran.kolom.status"),
      render: (l) => <LamaranStatusBadge status={l.status} />,
    },
    {
      kunci: "discloseDisability",
      label: t("admin.lamaran.kolom.diungkap"),
      render: (l) =>
        l.discloseDisability ? t("admin.lamaran.diungkap.ya") : t("admin.lamaran.diungkap.tidak"),
    },
    {
      kunci: "appliedAt",
      label: t("admin.lamaran.kolom.tanggal"),
      render: (l) => TANGGAL_LAMARAN.format(new Date(l.appliedAt)),
    },
    {
      kunci: "id",
      label: t("admin.lamaran.kolom.aksi"),
      render: (l) => (
        <Link
          to={`/admin/lamaran/${l.id}`}
          aria-label={t("admin.lamaran.lihatLabel", {
            nama: l.applicant.fullName ?? t("admin.lamaran.akunDihapus"),
          })}
          className="text-base font-medium text-gray-900 underline hover:no-underline"
        >
          {t("admin.lamaran.lihat")}
        </Link>
      ),
    },
  ];

  return (
    <section aria-labelledby="admin-lamaran-judul" className="flex flex-col gap-4">
      <h2 id="admin-lamaran-judul" className="text-2xl font-semibold text-gray-900">
        {t("admin.lamaran.judul")}
      </h2>
      <p className="text-base text-gray-900">{t("admin.lamaran.penjelasan")}</p>

      <div className="flex flex-wrap gap-4">
        <KolomForm label={t("admin.lamaran.filterStatus.label")} className="min-w-56">
          <Pilihan
            opsi={[
              { nilai: SEMUA, label: t("admin.lamaran.filterStatus.semua") },
              ...applicationStatusSchema.options.map((s) => ({
                nilai: s,
                label: t(KUNCI_STATUS_LAMARAN[s]),
              })),
            ]}
            nilai={status}
            onUbah={setStatus}
          />
        </KolomForm>
        <KolomForm label={t("admin.lamaran.filterLowongan.label")} className="min-w-56">
          <Pilihan
            opsi={[
              { nilai: SEMUA, label: t("admin.lamaran.filterLowongan.semua") },
              ...(lowongan.data ?? []).map((j) => ({ nilai: j.id, label: j.title })),
            ]}
            nilai={jobId}
            onUbah={setJobId}
          />
        </KolomForm>
      </div>
      <KotakCentang
        label={t("admin.lamaran.filterDitangguhkan.label")}
        bantuan={t("admin.lamaran.filterDitangguhkan.bantuan")}
        dicentang={termasukDitangguhkan}
        onUbah={setTermasukDitangguhkan}
      />

      {daftar.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{t("admin.lamaran.gagalMuat")}</p>
          <p className="text-base text-gray-900">{pesanGalatLamaran(daftar.error, t)}</p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void daftar.refetch();
            }}
          >
            {t("admin.lamaran.cobaLagi")}
          </Tombol>
        </div>
      ) : (
        <WilayahMemuat memuat={daftar.isPending} label={t("admin.lamaran.memuat")}>
          <Tabel
            kolom={kolom}
            data={data}
            kunciBaris={(l) => l.id}
            judul={t("admin.lamaran.tabelJudul")}
            kosong={
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-base font-semibold text-gray-900">
                  {t("admin.lamaran.kosong.judul")}
                </p>
                <p className="text-base text-gray-900">{t("admin.lamaran.kosong.penjelasan")}</p>
              </div>
            }
          />
        </WilayahMemuat>
      )}

      {/* Diumumkan hanya setelah halaman KEDUA dst. — angka pertama sudah terbaca di tabel. */}
      <p role="status" className="sr-only">
        {(daftar.data?.pages.length ?? 0) > 1
          ? t("admin.lamaran.jumlahTampil", { jumlah: String(data.length) })
          : ""}
      </p>

      {daftar.hasNextPage && (
        <Tombol
          varian="sekunder"
          className="self-start"
          aria-disabled={daftar.isFetchingNextPage}
          aria-busy={daftar.isFetchingNextPage}
          onClick={() => {
            if (daftar.isFetchingNextPage) return;
            void daftar.fetchNextPage();
          }}
        >
          {daftar.isFetchingNextPage ? t("admin.lamaran.memuatLagi") : t("admin.lamaran.muatLagi")}
        </Tombol>
      )}
    </section>
  );
}
