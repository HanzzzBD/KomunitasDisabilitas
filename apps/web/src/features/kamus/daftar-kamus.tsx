// Pencarian + grid kamus BISINDO publik (PR-086).
//
// KARTU BERLABEL (AC): tiap kartu adalah `<li>` dengan judul `<h2>` yang berisi
// SATU tautan bernama frasa — screen reader menyusuri daftar per judul atau per
// tautan dan mendengar frasanya, bukan "gambar, tautan, gambar". Gambar sampul
// dekoratif (`alt=""`): isinya sudah dikatakan judul.
//
// Formulir dikirim lewat tombol Cari, BUKAN per ketukan: hasil yang berganti
// saat mengetik adalah perubahan konteks yang tidak diminta (WCAG 3.2.2) dan
// membanjiri pengumuman jumlah hasil.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { searchSignVideos, signVideosKeys, type ApiClient } from "@nawasena/api-client";
import type { SignVideoCategory } from "@nawasena/schemas";
import { KolomForm, Masukan, Pilihan, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { pesanGalatApi } from "../../shared/galat-api.js";
import type { FilterKamus } from "./filter-url.js";

export const KATEGORI: readonly SignVideoCategory[] = [
  "salam",
  "perkenalan",
  "wawancara",
  "tempat_kerja",
  "akomodasi",
  "waktu",
  "angka",
  "umum",
];

export interface DaftarKamusProps {
  klien: ApiClient;
  filter: FilterKamus;
  onTerapkan: (filter: FilterKamus) => void;
  /** Query string pencarian saat ini — dibawa ke detail agar "Kembali" utuh. */
  asalPencarian: string;
  /** Entri yang harus difokus (kembali dari detail), sekali. */
  fokusId: string | null;
  onBuka: (id: string) => void;
}

export function DaftarKamus({
  klien,
  filter,
  onTerapkan,
  asalPencarian,
  fokusId,
  onBuka,
}: DaftarKamusProps) {
  const t = useTeks();
  const [query, setQuery] = useState(filter.query ?? "");
  const [kategori, setKategori] = useState<SignVideoCategory | "semua">(filter.category ?? "semua");
  const tautan = useRef(new Map<string, HTMLAnchorElement>());

  const hasil = useQuery({
    queryKey: signVideosKeys.search(filter),
    queryFn: () => searchSignVideos(klien, { ...filter, limit: 50 }),
  });

  useEffect(() => {
    if (fokusId !== null && hasil.data !== undefined) tautan.current.get(fokusId)?.focus();
  }, [fokusId, hasil.data]);

  return (
    <div className="flex flex-col gap-6">
      <form
        role="search"
        aria-label={t("kamus.cari.label")}
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          onTerapkan({
            ...(q === "" ? {} : { query: q }),
            ...(kategori === "semua" ? {} : { category: kategori }),
          });
        }}
      >
        <KolomForm label={t("kamus.cari.kataKunci")} className="sm:flex-1">
          <Masukan
            type="search"
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
          />
        </KolomForm>
        <KolomForm label={t("kamus.cari.kategori")} className="sm:w-56">
          <Pilihan
            opsi={[
              { nilai: "semua", label: t("kamus.kategori.semua") },
              ...KATEGORI.map((k) => ({ nilai: k, label: t(`kamus.kategori.${k}`) })),
            ]}
            nilai={kategori}
            onUbah={(dipilih) => setKategori(dipilih as SignVideoCategory | "semua")}
          />
        </KolomForm>
        <Tombol type="submit">{t("kamus.cari.tombol")}</Tombol>
      </form>

      <section aria-labelledby="kamus-hasil-judul" className="flex flex-col gap-4">
        <h2 id="kamus-hasil-judul" className="sr-only">
          {t("kamus.hasil.judul")}
        </h2>
        {hasil.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-base font-medium text-red-700">
              {pesanGalatApi(hasil.error, t, {
                JARINGAN_GAGAL: "shell.galat.jaringan",
                BELUM_SIAP: "kamus.galat.belumSiap",
              })}
            </p>
            <Tombol varian="sekunder" onClick={() => void hasil.refetch()}>
              {t("kamus.cobaLagi")}
            </Tombol>
          </div>
        ) : (
          <WilayahMemuat memuat={hasil.isPending} label={t("kamus.memuat")}>
            <p role="status" className="text-base text-gray-900">
              {hasil.data === undefined
                ? ""
                : hasil.data.length === 0
                  ? t("kamus.hasil.kosong")
                  : t("kamus.hasil.jumlah", { jumlah: hasil.data.length })}
            </p>
            <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {(hasil.data ?? []).map((v) => (
                <li
                  key={v.id}
                  className="flex flex-col gap-2 rounded-md border border-gray-300 p-3 focus-within:ring-2 focus-within:ring-gray-900"
                >
                  {v.thumbnailUrl !== null && (
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="aspect-video w-full rounded object-cover"
                    />
                  )}
                  <h3 className="text-lg font-semibold text-gray-900">
                    <Link
                      ref={(el) => {
                        if (el === null) tautan.current.delete(v.id);
                        else tautan.current.set(v.id, el);
                      }}
                      to={`/kamus/${v.id}`}
                      state={{ asal: asalPencarian }}
                      onClick={() => onBuka(v.id)}
                      className="underline hover:no-underline"
                    >
                      {v.phrase}
                    </Link>
                  </h3>
                  {v.category !== null && (
                    <p className="text-base text-gray-700">{t(`kamus.kategori.${v.category}`)}</p>
                  )}
                </li>
              ))}
            </ul>
          </WilayahMemuat>
        )}
      </section>
    </div>
  );
}
