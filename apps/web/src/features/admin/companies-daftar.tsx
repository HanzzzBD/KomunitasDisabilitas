// Daftar perusahaan admin (PR-053) — konsumen PERTAMA `Tabel` (PR-052) dengan
// data sungguhan.
//
// KEADAAN SUNTING (SUNTING PERUSAHAAN, dsb) HIDUP DI ROUTE FORMULIR, BUKAN DI
// SINI. Komponen ini murni daftar + tautan "Ubah" per baris — pola yang sama
// dengan keputusan "halaman terpisah" untuk form (lihat `routes/admin-companies-
// formulir.tsx`): navigasi ke alamat lain, bukan state lokal yang mengganti
// tampilan di tempat.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { companiesKeys, listCompaniesAdmin, type ApiClient } from "@nawasena/api-client";
import type { CompanyAdmin } from "@nawasena/schemas";
import { Tabel, Tombol, WilayahMemuat, type KolomTabel, type UrutanTabel } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { pesanGalatSimpan } from "./companies-pesan-galat.js";
import { StatusBadge } from "./companies-status-badge.js";

/** Bandingkan dua nilai kolom secara stabil, terlepas dari tipenya. */
function bandingkan(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "id");
  return String(a ?? "").localeCompare(String(b ?? ""), "id");
}

export interface DaftarPerusahaanProps {
  klien: ApiClient;
}

export function DaftarPerusahaan({ klien }: DaftarPerusahaanProps) {
  const t = useTeks();
  const [urutan, setUrutan] = useState<UrutanTabel | undefined>(undefined);

  const daftar = useQuery({
    queryKey: companiesKeys.adminList(),
    queryFn: () => listCompaniesAdmin(klien),
  });

  const data = useMemo(() => {
    const baris = daftar.data ?? [];
    if (urutan === undefined) return baris;
    const arah = urutan.arah === "asc" ? 1 : -1;
    return [...baris].sort(
      (a, b) => bandingkan(a[urutan.kunci as keyof CompanyAdmin], b[urutan.kunci as keyof CompanyAdmin]) * arah,
    );
  }, [daftar.data, urutan]);

  function onUrutkan(kunci: string): void {
    setUrutan((sebelum) => {
      if (sebelum === undefined || sebelum.kunci !== kunci) return { kunci, arah: "asc" };
      return { kunci, arah: sebelum.arah === "asc" ? "desc" : "asc" };
    });
  }

  const kolom: ReadonlyArray<KolomTabel<CompanyAdmin>> = [
    { kunci: "name", label: t("admin.companies.kolom.nama"), urut: true },
    {
      kunci: "city",
      label: t("admin.companies.kolom.kota"),
      urut: true,
      render: (p) => p.city ?? "",
    },
    {
      kunci: "inclusivityStatus",
      label: t("admin.companies.kolom.status"),
      urut: true,
      render: (p) => <StatusBadge status={p.inclusivityStatus} />,
    },
    {
      kunci: "id",
      label: t("admin.companies.kolom.aksi"),
      render: (p) => (
        <Link
          to={`/admin/companies/${p.id}`}
          aria-label={t("admin.companies.ubahLabel", { nama: p.name })}
          className="text-base font-medium text-gray-900 underline hover:no-underline"
        >
          {t("admin.companies.ubah")}
        </Link>
      ),
    },
  ];

  return (
    <section aria-labelledby="admin-companies-judul" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="admin-companies-judul" className="text-2xl font-semibold text-gray-900">
          {t("admin.companies.judul")}
        </h2>
        <Link
          to="/admin/companies/baru"
          className="inline-flex min-h-sentuh items-center rounded-md bg-gray-900 px-4 text-base font-semibold text-white"
        >
          {t("admin.companies.tambah")}
        </Link>
      </div>
      <p className="text-base text-gray-900">{t("admin.companies.penjelasan")}</p>

      {daftar.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{t("admin.companies.gagalMuat")}</p>
          <p className="text-base text-gray-900">{pesanGalatSimpan(daftar.error, t)}</p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void daftar.refetch();
            }}
          >
            {t("admin.companies.cobaLagi")}
          </Tombol>
        </div>
      ) : (
        <WilayahMemuat memuat={daftar.isPending} label={t("admin.companies.memuat")}>
          <Tabel
            kolom={kolom}
            data={data}
            kunciBaris={(p) => p.id}
            judul={t("admin.companies.tabelJudul")}
            kosong={
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-base font-semibold text-gray-900">
                  {t("admin.companies.kosong.judul")}
                </p>
                <p className="text-base text-gray-900">{t("admin.companies.kosong.penjelasan")}</p>
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
