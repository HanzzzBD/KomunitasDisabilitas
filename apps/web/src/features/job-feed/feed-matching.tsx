// Feed AI Job Matching — beranda seeker (PR-074, US-07).
//
// ORKESTRASI: `GET /me/matches` (cursor, `useInfiniteQuery`), refresh berkuota
// `POST /me/matches/refresh`, banner status AI, pemulihan fokus dari detail.
// Kartu memakai `KartuLowongan` yang SAMA dengan pencarian — skor dan alasan
// masuk lewat slot `pembuka`.
//
// TIDAK ADA YANG BERUBAH SENDIRI (keputusan owner 2026-09-30). Saat re-rank AI
// masih berjalan (`meta.aiMenyusun`), halaman hanya MEMBERI TAHU lewat banner
// dan menawarkan tombol "Tampilkan urutan terbaru". Kartu yang berpindah
// tempat tanpa diminta adalah perubahan konteks tak terduga — paling
// mengganggu pengguna autisme dan pengguna screen reader yang sedang membaca.
//
// BANNER = `role="status"` YANG SELALU TERPASANG (isinya berganti, wadahnya
// tidak) — live region yang baru dipasang bersama isinya sering tidak
// diumumkan sama sekali. Ia tidak mencuri fokus.
//
// REFRESH HABIS → TOMBOL `aria-disabled`, BUKAN `disabled`. Tombol `disabled`
// keluar dari urutan Tab dan kehilangan fokus tepat saat jatah terakhir
// dipakai (fokus jatuh ke `<body>`); `aria-disabled` tetap bisa dicapai dan
// dibacakan beserta alasannya (`aria-describedby`), dan klik tidak melakukan
// apa-apa. AC "habis → tombol nonaktif dengan alasan".
//
// FOKUS SESUDAH DAFTAR DIGANTI ("Tampilkan urutan terbaru" menghilangkan
// tombolnya sendiri): fokus dipindah ke judul daftar (`tabIndex={-1}`), bukan
// dibiarkan jatuh ke `<body>`.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { listMatches, matchingKeys, refreshMatches, type ApiClient } from "@nawasena/api-client";
import type { MatchesResponse } from "@nawasena/schemas";
import { KeadaanKosong, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { idPenggunaSaatIni } from "../onboarding/identitas.js";
import { KartuLowongan } from "./kartu-lowongan.js";
import { Kecocokan } from "./kecocokan.js";
import { pesanGalatLowongan } from "./pesan-galat.js";

/** Satu halaman = 20 — bawaan server (`matchesQuerySchema`). */
export const PER_HALAMAN_FEED = 20;

type DataFeed = InfiniteData<MatchesResponse, string | undefined>;

export interface FeedMatchingProps {
  klien: ApiClient;
  /** Tujuan "Cari lowongan lain" — halaman cari, filter dari profil sudah terisi. */
  tautanCariLain: string;
  /** Lowongan yang tadi dibuka dari feed ini — fokus dikembalikan ke kartunya. */
  fokusLowonganId?: string | null;
  onBukaLowongan?: (id: string) => void;
  onFokusDipulihkan?: () => void;
}

export function FeedMatching({
  klien,
  tautanCariLain,
  fokusLowonganId = null,
  onBukaLowongan,
  onFokusDipulihkan,
}: FeedMatchingProps) {
  const t = useTeks();
  const queryClient = useQueryClient();
  // Dilingkupi pemilik — alasan di `matchingKeys`. Fungsi yang sama dengan
  // halaman profil (`routes/profil.tsx`).
  const kunci = matchingKeys.feed(idPenggunaSaatIni());
  const idSisa = useId();
  const judulDaftar = useRef<HTMLHeadingElement>(null);
  const [pengumuman, setPengumuman] = useState("");

  const daftar = useInfiniteQuery({
    queryKey: kunci,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listMatches(klien, {
        limit: PER_HALAMAN_FEED,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (terakhir: MatchesResponse) => terakhir.meta.nextCursor ?? undefined,
  });

  /** Ganti seluruh daftar dengan satu halaman pertama yang baru. */
  const ganti = useCallback(
    (halaman: MatchesResponse) => {
      queryClient.setQueryData<DataFeed>(kunci, { pages: [halaman], pageParams: [undefined] });
    },
    [queryClient, kunci],
  );

  const segarkan = useMutation({
    mutationFn: () => refreshMatches(klien, { limit: PER_HALAMAN_FEED }),
    onSuccess: (halaman) => {
      ganti(halaman);
      setPengumuman(t("beranda.feed.refresh.berhasil"));
    },
  });

  const terbaru = useMutation({
    mutationFn: () => listMatches(klien, { limit: PER_HALAMAN_FEED }),
    onSuccess: (halaman) => {
      ganti(halaman);
      judulDaftar.current?.focus();
    },
  });

  const halaman = daftar.data?.pages ?? [];
  const meta = halaman[0]?.meta;
  const items = halaman.flatMap((h) => h.data);
  const sisa = meta?.sisaRefresh ?? 0;
  const habis = meta !== undefined && sisa === 0;

  // Pemulihan fokus dari halaman detail — pola sama `browse-daftar.tsx`.
  const tautan = useRef(new Map<string, HTMLAnchorElement>());
  const fokusSudahDipulihkan = useRef(false);
  useEffect(() => {
    if (fokusLowonganId === null || fokusSudahDipulihkan.current) return;
    const sasaran = tautan.current.get(fokusLowonganId);
    if (sasaran === undefined) return;
    fokusSudahDipulihkan.current = true;
    sasaran.focus({ preventScroll: true });
    sasaran.scrollIntoView({ block: "nearest" });
    onFokusDipulihkan?.();
  }, [fokusLowonganId, items, onFokusDipulihkan]);

  return (
    <div className="flex flex-col gap-6">
      {/* Banner status AI — wadah SELALU ada, isinya yang berganti. */}
      <div role="status" className="flex flex-col gap-2">
        {meta?.aiMenyusun === true ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-gray-400 p-4">
            <p className="text-base text-gray-900">{t("beranda.feed.status.menyusun")}</p>
            <Tombol
              varian="sekunder"
              disabled={terbaru.isPending}
              onClick={() => {
                terbaru.mutate();
              }}
            >
              {t("beranda.feed.status.tampilkanTerbaru")}
            </Tombol>
          </div>
        ) : null}
        {meta?.degraded === true ? (
          <p className="rounded-md border border-gray-400 p-4 text-base text-gray-900">
            {t("beranda.feed.status.turun")}
          </p>
        ) : null}
      </div>

      {meta !== undefined ? (
        <div className="flex flex-col items-start gap-2">
          <Tombol
            varian="sekunder"
            aria-disabled={habis || undefined}
            aria-describedby={idSisa}
            disabled={segarkan.isPending}
            className="aria-disabled:cursor-not-allowed"
            onClick={() => {
              if (habis) return;
              segarkan.mutate();
            }}
          >
            {t("beranda.feed.refresh.tombol")}
          </Tombol>
          <p id={idSisa} className="text-sm text-gray-700">
            {habis
              ? t("beranda.feed.refresh.habis")
              : t("beranda.feed.refresh.sisa", { jumlah: sisa })}
          </p>
          {segarkan.isError ? (
            <p role="alert" className="text-base text-red-700">
              {t("beranda.feed.refresh.gagal")}
            </p>
          ) : null}
        </div>
      ) : null}

      <p role="status" className="sr-only">
        {pengumuman}
      </p>

      <section aria-labelledby="feed-daftar-judul" className="flex flex-col gap-4">
        {/* Tidak terlihat: `<h1>` halaman sudah menamai isinya. Ada untuk
            `aria-labelledby` dan sebagai sasaran fokus sesudah daftar diganti. */}
        <h2 id="feed-daftar-judul" ref={judulDaftar} tabIndex={-1} className="sr-only">
          {t("beranda.feed.daftarJudul")}
        </h2>

        {daftar.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-base font-medium text-red-700">{t("beranda.feed.gagalMuat")}</p>
            <p className="text-base text-gray-900">{pesanGalatLowongan(daftar.error, t)}</p>
            <Tombol
              varian="sekunder"
              onClick={() => {
                void daftar.refetch();
              }}
            >
              {t("beranda.feed.cobaLagi")}
            </Tombol>
          </div>
        ) : (
          <WilayahMemuat memuat={daftar.isPending} label={t("beranda.feed.memuat")}>
            {items.length === 0 ? (
              meta?.alasanKosong === "profil-belum-siap" ? (
                <KeadaanKosong
                  tingkatJudul={3}
                  judul={t("beranda.feed.kosong.profil.judul")}
                  aksi={
                    <Link
                      to="/profil"
                      className="inline-flex min-h-sentuh items-center rounded-md bg-gray-900 px-4 text-base font-semibold text-white"
                    >
                      {t("beranda.feed.kosong.profil.aksi")}
                    </Link>
                  }
                >
                  {t("beranda.feed.kosong.profil.isi")}
                </KeadaanKosong>
              ) : (
                <KeadaanKosong tingkatJudul={3} judul={t("beranda.feed.kosong.tanpa.judul")}>
                  {t("beranda.feed.kosong.tanpa.isi")}
                </KeadaanKosong>
              )
            ) : (
              <ul className="flex list-none flex-col gap-3 p-0">
                {items.map((item) => (
                  <li key={item.job.id}>
                    <KartuLowongan
                      lowongan={item.job}
                      pembuka={<Kecocokan item={item} />}
                      refTautan={(el) => {
                        if (el === null) tautan.current.delete(item.job.id);
                        else tautan.current.set(item.job.id, el);
                      }}
                      onBuka={() => {
                        onBukaLowongan?.(item.job.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </WilayahMemuat>
        )}

        {daftar.hasNextPage ? (
          <Tombol
            varian="sekunder"
            disabled={daftar.isFetchingNextPage}
            onClick={() => {
              void daftar.fetchNextPage();
            }}
          >
            {t("beranda.feed.muatLagi")}
          </Tombol>
        ) : null}
      </section>

      {/* Jembatan ke pencarian (keputusan owner 2026-09-30) — feed tidak punya
          filter sendiri; mencari dengan kriteria lain dilakukan di sana. */}
      <Link
        to={tautanCariLain}
        className="inline-flex min-h-sentuh items-center self-start rounded-md border border-gray-400 px-4 text-base font-semibold text-gray-900"
      >
        {t("beranda.feed.cariLain")}
      </Link>
    </div>
  );
}
