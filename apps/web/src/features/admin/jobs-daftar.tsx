// Daftar lowongan admin (PR-057) — pola sama `companies-daftar.tsx`, dua
// tambahan yang tidak dipunyai companies: KOLOM PERUSAHAAN (dari JOIN
// client-side dengan `listCompaniesAdmin`, sebab `JobAdmin` hanya menyimpan
// `companyId`) dan AKSI DUPLIKASI (AC "Duplikasi lowongan (copy as draft)
// tersedia — efisiensi kurasi").
//
// DUPLIKASI LANGSUNG MEMANGGIL API, TANPA JEDA KONFIRMASI — keputusan sadar,
// bukan default yang lupa dipikirkan. Hasilnya draft baru yang belum
// terbit dan belum terlihat siapa pun; kesalahan duplikasi (mis. keliru
// menekan baris yang salah) tidak berdampak pada pelamar atau publik, jadi
// biaya kesalahannya rendah — beda dari "Tutup" (`admin-jobs-formulir.tsx`)
// yang MEMANG butuh dialog karena dampaknya ke pelamar yang sudah melamar.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  companiesKeys,
  createJobAdmin,
  jobsKeys,
  listCompaniesAdmin,
  listJobsAdmin,
  type ApiClient,
} from "@nawasena/api-client";
import type { JobAdmin } from "@nawasena/schemas";
import {
  KolomForm,
  Pilihan,
  Tabel,
  Tombol,
  WilayahMemuat,
  type KolomTabel,
  type UrutanTabel,
} from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { keBadanDuplikat } from "./jobs-badan.js";
import { pesanGalatSimpan } from "./jobs-pesan-galat.js";
import { JobStatusBadge } from "./jobs-status-badge.js";

/** Bandingkan dua nilai kolom secara stabil, terlepas dari tipenya. Sama dengan `companies-daftar.tsx`. */
function bandingkan(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "id");
  return String(a ?? "").localeCompare(String(b ?? ""), "id");
}

const FILTER_STATUS = ["semua", "draft", "published", "closed"] as const;
type FilterStatus = (typeof FILTER_STATUS)[number];

export interface DaftarLowonganProps {
  klien: ApiClient;
}

export function DaftarLowongan({ klien }: DaftarLowonganProps) {
  const t = useTeks();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [urutan, setUrutan] = useState<UrutanTabel | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("semua");

  const daftar = useQuery({
    queryKey: jobsKeys.adminList(),
    queryFn: () => listJobsAdmin(klien),
  });
  // Hanya untuk nama perusahaan di kolom "Perusahaan" — daftar yang SAMA
  // dipakai `admin-jobs-formulir.tsx` untuk pemilih perusahaan, jadi cache
  // TanStack yang sudah terisi di sini membuat perpindahan ke sana seketika.
  const perusahaan = useQuery({
    queryKey: companiesKeys.adminList(),
    queryFn: () => listCompaniesAdmin(klien),
  });

  const namaPerusahaan = useMemo(() => {
    const peta = new Map<string, string>();
    for (const p of perusahaan.data ?? []) peta.set(p.id, p.name);
    return peta;
  }, [perusahaan.data]);

  const data = useMemo(() => {
    const baris = daftar.data ?? [];
    const tersaring =
      filterStatus === "semua" ? baris : baris.filter((j) => j.status === filterStatus);
    if (urutan === undefined) return tersaring;
    const arah = urutan.arah === "asc" ? 1 : -1;
    return [...tersaring].sort(
      (a, b) =>
        bandingkan(a[urutan.kunci as keyof JobAdmin], b[urutan.kunci as keyof JobAdmin]) * arah,
    );
  }, [daftar.data, filterStatus, urutan]);

  function onUrutkan(kunci: string): void {
    setUrutan((sebelum) => {
      if (sebelum === undefined || sebelum.kunci !== kunci) return { kunci, arah: "asc" };
      return { kunci, arah: sebelum.arah === "asc" ? "desc" : "asc" };
    });
  }

  const duplikasi = useMutation({
    mutationFn: (job: JobAdmin) => createJobAdmin(klien, keBadanDuplikat(job)),
    onSuccess: (hasil) => {
      queryClient.setQueryData<JobAdmin[]>(jobsKeys.adminList(), (sebelum) =>
        sebelum === undefined ? sebelum : [...sebelum, hasil],
      );
      // Duplikat berhasil → LANGSUNG ke halaman Ubah draft baru, pola sama
      // "buat" biasa: AC menyebut duplikasi sebagai jalan PINTAS mengisi
      // formulir, bukan sekadar menambah baris di daftar.
      navigate(`/admin/jobs/${hasil.id}`);
    },
  });

  const kolom: ReadonlyArray<KolomTabel<JobAdmin>> = [
    { kunci: "title", label: t("admin.jobs.kolom.judul"), urut: true },
    {
      kunci: "companyId",
      label: t("admin.jobs.kolom.perusahaan"),
      render: (j) => namaPerusahaan.get(j.companyId) ?? t("admin.jobs.kolom.perusahaanTakDikenal"),
    },
    {
      kunci: "status",
      label: t("admin.jobs.kolom.status"),
      urut: true,
      render: (j) => <JobStatusBadge status={j.status} />,
    },
    {
      kunci: "id",
      label: t("admin.jobs.kolom.aksi"),
      render: (j) => (
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/admin/jobs/${j.id}`}
            aria-label={t("admin.jobs.ubahLabel", { judul: j.title })}
            className="text-base font-medium text-gray-900 underline hover:no-underline"
          >
            {t("admin.jobs.ubah")}
          </Link>
          <Tombol
            varian="sekunder"
            ukuran="kecil"
            aria-label={t("admin.jobs.duplikatLabel", { judul: j.title })}
            aria-disabled={duplikasi.isPending}
            aria-busy={duplikasi.isPending}
            onClick={() => {
              if (duplikasi.isPending) return;
              duplikasi.mutate(j);
            }}
          >
            {t("admin.jobs.duplikat")}
          </Tombol>
        </div>
      ),
    },
  ];

  return (
    <section aria-labelledby="admin-jobs-judul" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="admin-jobs-judul" className="text-2xl font-semibold text-gray-900">
          {t("admin.jobs.judul")}
        </h2>
        <Link
          to="/admin/jobs/baru"
          className="inline-flex min-h-sentuh items-center rounded-md bg-gray-900 px-4 text-base font-semibold text-white"
        >
          {t("admin.jobs.tambah")}
        </Link>
      </div>
      <p className="text-base text-gray-900">{t("admin.jobs.penjelasan")}</p>

      <KolomForm label={t("admin.jobs.filterStatus.label")} className="max-w-xs">
        <Pilihan
          opsi={FILTER_STATUS.map((s) => ({
            nilai: s,
            label: t(`admin.jobs.filterStatus.${s === "semua" ? "semua" : s}` as const),
          }))}
          nilai={filterStatus}
          onUbah={(dipilih) => {
            setFilterStatus(dipilih as FilterStatus);
          }}
        />
      </KolomForm>

      {duplikasi.isError && (
        <p role="alert" className="text-base font-medium text-red-700">
          {pesanGalatSimpan(duplikasi.error, t)}
        </p>
      )}

      {daftar.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{t("admin.jobs.gagalMuat")}</p>
          <p className="text-base text-gray-900">{pesanGalatSimpan(daftar.error, t)}</p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void daftar.refetch();
            }}
          >
            {t("admin.jobs.cobaLagi")}
          </Tombol>
        </div>
      ) : (
        <WilayahMemuat memuat={daftar.isPending} label={t("admin.jobs.memuat")}>
          <Tabel
            kolom={kolom}
            data={data}
            kunciBaris={(j) => j.id}
            judul={t("admin.jobs.tabelJudul")}
            kosong={
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-base font-semibold text-gray-900">
                  {t("admin.jobs.kosong.judul")}
                </p>
                <p className="text-base text-gray-900">{t("admin.jobs.kosong.penjelasan")}</p>
              </div>
            }
            urutan={urutan}
            onUrutkan={onUrutkan}
          />
        </WilayahMemuat>
      )}
    </section>
  );
}
