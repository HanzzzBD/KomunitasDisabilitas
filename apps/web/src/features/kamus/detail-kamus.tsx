// Detail satu entri kamus (PR-086): judul frasa, pemutar caption-on, transkrip
// DI BAWAH pemutar (AC). Transkrip adalah teks biasa yang selalu tampil — bukan
// panel lipat — supaya pengguna netra dan yang tidak memutar video langsung
// mendapat isinya, dan pemutar merujuknya lewat `aria-describedby`.
import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApiError, getSignVideo, signVideosKeys, type ApiClient } from "@nawasena/api-client";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useJudulHalaman } from "../../shared/judul-halaman.js";
import { pesanGalatApi } from "../../shared/galat-api.js";
import { PemutarKamus } from "./pemutar.js";

export interface DetailKamusProps {
  klien: ApiClient;
  id: string;
  /** Query string pencarian asal (dari kartu) — `""` bila dibuka langsung. */
  asal: string;
}

export function DetailKamus({ klien, id, asal }: DetailKamusProps) {
  const t = useTeks();
  const idTranskrip = useId();
  const entri = useQuery({
    queryKey: signVideosKeys.detail(id),
    queryFn: () => getSignVideo(klien, id),
    // URL media presigned: tidak diambil ulang diam-diam saat fokus kembali —
    // `src` yang berganti di tengah pemutaran akan memulai video dari awal.
    // Pemutar sendiri yang meminta URL baru saat dibutuhkan.
    refetchOnWindowFocus: false,
    retry: (jumlah, galat) =>
      !(galat instanceof ApiError && galat.code === "VIDEO_ISYARAT_TIDAK_DITEMUKAN") && jumlah < 2,
  });

  useJudulHalaman(t("shell.judulDokumen", { halaman: entri.data?.phrase ?? t("kamus.judul") }));

  const kembali = (
    <Link
      to={`/kamus${asal}`}
      className="text-base font-medium text-gray-900 underline hover:no-underline"
    >
      {t("kamus.detail.kembali")}
    </Link>
  );

  if (entri.isError) {
    const tidakAda =
      entri.error instanceof ApiError && entri.error.code === "VIDEO_ISYARAT_TIDAK_DITEMUKAN";
    return (
      <div className="flex flex-col gap-4">
        {kembali}
        <h1 className="text-3xl font-bold text-gray-900">{t("kamus.judul")}</h1>
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">
            {tidakAda
              ? t("kamus.detail.tidakAda")
              : pesanGalatApi(entri.error, t, {
                  JARINGAN_GAGAL: "shell.galat.jaringan",
                  BELUM_SIAP: "kamus.galat.belumSiap",
                })}
          </p>
          {!tidakAda && (
            <Tombol varian="sekunder" onClick={() => void entri.refetch()}>
              {t("kamus.cobaLagi")}
            </Tombol>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {kembali}
      <WilayahMemuat memuat={entri.isPending} label={t("kamus.memuat")}>
        {entri.data !== undefined && (
          <article aria-labelledby={`${idTranskrip}-judul`} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h1
                id={`${idTranskrip}-judul`}
                className="text-3xl font-bold break-words text-gray-900"
              >
                {entri.data.phrase}
              </h1>
              {entri.data.category !== null && (
                <p className="text-base text-gray-700">
                  {t(`kamus.kategori.${entri.data.category}`)}
                </p>
              )}
            </div>
            <PemutarKamus
              entri={entri.data}
              idTranskrip={idTranskrip}
              onPerbarui={() => entri.refetch()}
            />
            <section aria-labelledby={`${idTranskrip}-transkrip`} className="flex flex-col gap-2">
              <h2 id={`${idTranskrip}-transkrip`} className="text-2xl font-semibold text-gray-900">
                {t("kamus.detail.transkrip")}
              </h2>
              <p
                id={idTranskrip}
                className="max-w-prose text-base whitespace-pre-line text-gray-900"
              >
                {entri.data.transcript}
              </p>
            </section>
          </article>
        )}
      </WilayahMemuat>
    </div>
  );
}
