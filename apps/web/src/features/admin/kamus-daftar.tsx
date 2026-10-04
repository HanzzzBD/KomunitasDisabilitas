// Daftar kamus BISINDO admin (PR-085b) — pola sama `jobs-daftar.tsx`, dengan
// kolom KELENGKAPAN: tim konten melihat sekilas entri mana yang belum siap
// terbit dan kenapa, tanpa membuka satu per satu. Ditulis sebagai TEKS
// ("Kurang: caption"), bukan ikon centang — WCAG 1.1.1 / 1.4.1.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { listSignVideosAdmin, signVideosKeys, type ApiClient } from "@nawasena/api-client";
import type { SignVideoAdmin } from "@nawasena/schemas";
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
import { kekuranganKamus } from "./kamus-badan.js";
import { pesanGalatKamus } from "./kamus-pesan-galat.js";
import { JobStatusBadge } from "./jobs-status-badge.js";

const FILTER_STATUS = ["semua", "draft", "published"] as const;
type FilterStatus = (typeof FILTER_STATUS)[number];

export function DaftarKamus({ klien }: { klien: ApiClient }) {
  const t = useTeks();
  const [urutan, setUrutan] = useState<UrutanTabel | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("semua");

  const daftar = useQuery({
    queryKey: signVideosKeys.adminList(),
    queryFn: () => listSignVideosAdmin(klien),
  });

  const data = useMemo(() => {
    const baris = daftar.data ?? [];
    const tersaring =
      filterStatus === "semua" ? baris : baris.filter((v) => v.status === filterStatus);
    if (urutan === undefined) return tersaring;
    const arah = urutan.arah === "asc" ? 1 : -1;
    const kunci = urutan.kunci as "phrase" | "status";
    return [...tersaring].sort((a, b) => a[kunci].localeCompare(b[kunci], "id") * arah);
  }, [daftar.data, filterStatus, urutan]);

  const kolom: ReadonlyArray<KolomTabel<SignVideoAdmin>> = [
    { kunci: "phrase", label: t("admin.kamus.kolom.frasa"), urut: true },
    {
      kunci: "category",
      label: t("admin.kamus.kolom.kategori"),
      render: (v) =>
        v.category === null
          ? t("admin.kamus.tanpaKategori")
          : t(`admin.kamus.kategori.${v.category}`),
    },
    {
      kunci: "status",
      label: t("admin.kamus.kolom.status"),
      urut: true,
      render: (v) => <JobStatusBadge status={v.status} />,
    },
    {
      kunci: "videoKey",
      label: t("admin.kamus.kolom.kelengkapan"),
      render: (v) => {
        const kurang = kekuranganKamus(v);
        return kurang.length === 0
          ? t("admin.kamus.lengkap")
          : t("admin.kamus.kurangDaftar", { daftar: kurang.map((k) => t(k)).join(", ") });
      },
    },
    {
      kunci: "id",
      label: t("admin.kamus.kolom.aksi"),
      render: (v) => (
        <Link
          to={`/admin/kamus/${v.id}`}
          aria-label={t("admin.kamus.ubahLabel", { frasa: v.phrase })}
          className="text-base font-medium text-gray-900 underline hover:no-underline"
        >
          {t("admin.kamus.ubah")}
        </Link>
      ),
    },
  ];

  return (
    <section aria-labelledby="admin-kamus-judul" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="admin-kamus-judul" className="text-2xl font-semibold text-gray-900">
          {t("admin.kamus.judul")}
        </h2>
        <Link
          to="/admin/kamus/baru"
          className="inline-flex min-h-sentuh items-center rounded-md bg-gray-900 px-4 text-base font-semibold text-white"
        >
          {t("admin.kamus.tambah")}
        </Link>
      </div>
      <p className="text-base text-gray-900">{t("admin.kamus.penjelasan")}</p>

      <KolomForm label={t("admin.kamus.filterStatus.label")} className="max-w-xs">
        <Pilihan
          opsi={FILTER_STATUS.map((s) => ({ nilai: s, label: t(`admin.kamus.filterStatus.${s}`) }))}
          nilai={filterStatus}
          onUbah={(dipilih) => {
            setFilterStatus(dipilih as FilterStatus);
          }}
        />
      </KolomForm>

      {daftar.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{t("admin.kamus.gagalMuat")}</p>
          <p className="text-base text-gray-900">{pesanGalatKamus(daftar.error, t)}</p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void daftar.refetch();
            }}
          >
            {t("admin.kamus.cobaLagi")}
          </Tombol>
        </div>
      ) : (
        <WilayahMemuat memuat={daftar.isPending} label={t("admin.kamus.memuat")}>
          <Tabel
            kolom={kolom}
            data={data}
            kunciBaris={(v) => v.id}
            judul={t("admin.kamus.tabelJudul")}
            kosong={
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-base font-semibold text-gray-900">
                  {t("admin.kamus.kosong.judul")}
                </p>
                <p className="text-base text-gray-900">{t("admin.kamus.kosong.penjelasan")}</p>
              </div>
            }
            urutan={urutan}
            onUrutkan={(kunci) => {
              setUrutan((sebelum) =>
                sebelum === undefined || sebelum.kunci !== kunci
                  ? { kunci, arah: "asc" }
                  : { kunci, arah: sebelum.arah === "asc" ? "desc" : "asc" },
              );
            }}
          />
        </WilayahMemuat>
      )}
    </section>
  );
}
