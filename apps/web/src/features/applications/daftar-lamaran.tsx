// "Lamaran Saya" — daftar (PR-079).
//
// DAFTAR, BUKAN TABEL: pelamar membaca SATU lamaran sekaligus (judul → status
// → tanggal), bukan membandingkan kolom antarbaris seperti admin. Setiap
// lamaran adalah item `<li>` dengan judul `h2` — navigasi heading screen
// reader melompat antarlamaran — dan SATU tautan per item.
//
// "Muat lebih banyak", bukan gulir tanpa akhir (CLAUDE.md §5.2: no infinite
// scroll); jumlah yang tampil diumumkan lewat `role="status"`.
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { applicationsKeys, listMyApplications, type ApiClient } from "@nawasena/api-client";
import type { MyApplication } from "@nawasena/schemas";
import { KeadaanKosong, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { idPenggunaSaatIni } from "../onboarding/identitas.js";
import { pesanGalatLamaranSaya } from "./pesan-galat-lamaran-saya.js";
import { StatusLamaranBadge } from "./status-lamaran.js";

const PER_HALAMAN = 20;
export const TANGGAL_LAMARAN = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeZone: "Asia/Jakarta",
});

export function DaftarLamaran({ klien }: { klien: ApiClient }) {
  const t = useTeks();
  const sub = idPenggunaSaatIni();
  const daftar = useInfiniteQuery({
    queryKey: applicationsKeys.myList(sub),
    queryFn: ({ pageParam }) =>
      listMyApplications(klien, { cursor: pageParam, limit: PER_HALAMAN }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (halaman) => halaman.meta.nextCursor ?? undefined,
  });

  const lamaran = daftar.data?.pages.flatMap((h) => h.data) ?? [];

  if (daftar.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-base font-medium text-red-700">{t("pelamar.gagalMuat")}</p>
        <p className="text-base text-gray-900">{pesanGalatLamaranSaya(daftar.error, t)}</p>
        <Tombol
          varian="sekunder"
          onClick={() => {
            void daftar.refetch();
          }}
        >
          {t("pelamar.cobaLagi")}
        </Tombol>
      </div>
    );
  }

  return (
    <WilayahMemuat memuat={daftar.isPending} label={t("pelamar.memuat")}>
      {daftar.isSuccess && lamaran.length === 0 ? (
        <KeadaanKosong
          judul={t("pelamar.kosong.judul")}
          tingkatJudul={2}
          aksi={
            <Link
              to="/lowongan"
              className="inline-flex min-h-sentuh items-center justify-center rounded bg-gray-900 px-4 text-base font-semibold text-white"
            >
              {t("pelamar.kosong.cari")}
            </Link>
          }
        >
          {t("pelamar.kosong.penjelasan")}
        </KeadaanKosong>
      ) : null}

      {lamaran.length > 0 && (
        <div className="flex flex-col gap-4">
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {lamaran.map((l) => (
              <ItemLamaran key={l.id} lamaran={l} />
            ))}
          </ul>
          <p role="status" className="text-base text-gray-700">
            {t("pelamar.jumlah", { jumlah: lamaran.length })}
          </p>
          {daftar.hasNextPage && (
            <Tombol
              varian="sekunder"
              className="self-start"
              aria-disabled={daftar.isFetchingNextPage}
              aria-busy={daftar.isFetchingNextPage}
              onClick={() => {
                if (!daftar.isFetchingNextPage) void daftar.fetchNextPage();
              }}
            >
              {daftar.isFetchingNextPage ? t("pelamar.memuatLagi") : t("pelamar.muatLagi")}
            </Tombol>
          )}
        </div>
      )}
    </WilayahMemuat>
  );
}

function ItemLamaran({ lamaran }: { lamaran: MyApplication }) {
  const t = useTeks();
  const judul = lamaran.job?.title ?? t("pelamar.lowonganHilang");
  return (
    <li className="flex flex-col gap-2 rounded-md border border-gray-400 p-4">
      <h2 className="text-xl font-semibold break-words text-gray-900">{judul}</h2>
      {lamaran.job !== null && (
        <p className="text-base break-words text-gray-900">{lamaran.job.companyName}</p>
      )}
      <p className="flex flex-wrap items-center gap-2 text-base text-gray-900">
        <span>{t("pelamar.statusLabel")}:</span>
        <StatusLamaranBadge status={lamaran.status} />
      </p>
      <p className="text-base text-gray-700">
        {t("pelamar.dilamar", { tanggal: TANGGAL_LAMARAN.format(new Date(lamaran.appliedAt)) })}
        {" · "}
        {t("pelamar.diperbarui", {
          tanggal: TANGGAL_LAMARAN.format(new Date(lamaran.updatedAt)),
        })}
      </p>
      {lamaran.job !== null && !lamaran.job.aktif && (
        <p className="text-base text-gray-700">{t("pelamar.lowonganDitutup")}</p>
      )}
      <Link
        to={`/lamaran/${lamaran.id}`}
        className="self-start text-base font-medium break-words text-gray-900 underline hover:no-underline"
      >
        {t("pelamar.lihat", { judul })}
      </Link>
    </li>
  );
}
