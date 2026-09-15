// Daftar hasil pencarian lowongan publik (PR-058) — orkestrasi filter,
// pagination cursor, dan pengumuman hasil.
//
// FILTER DITERAPKAN HANYA SAAT SUBMIT (lihat `filter-panel.tsx`) — state
// `rancangan` (isian form, belum tentu berlaku) TERPISAH dari `filter`
// (yang benar-benar dipakai query). Sejak PR-059 `filter` DATANG DARI LUAR
// (query string URL, dipegang route) — komponen ini tidak lagi menyimpannya
// sendiri, supaya tombol Kembali dari halaman detail mengembalikan pencarian
// yang sama. Cursor pagination (`useInfiniteQuery`, pola sama
// `notifikasi/daftar.tsx`) otomatis mulai dari halaman pertama lagi begitu
// filter berubah — kunci query-nya (`jobsKeys.search`) ikut berubah.
//
// AC "Jumlah hasil diumumkan aria-live saat filter berubah": `PengumumanHasil`
// di bawah mengumumkan jumlah HALAMAN PERTAMA (bukan total terakumulasi —
// server tidak pernah mengirim total, hanya `nextCursor`) setiap kali kunci
// filter berubah DAN halaman pertamanya selesai dimuat. Nilai itu TIDAK
// pernah berubah akibat "Muat lebih banyak" (klik itu hanya menambah
// `pages[1]`, `pages[2]`, dst — `pages[0]` tetap), sehingga pengumuman
// otomatis hanya berbunyi untuk peristiwa yang benar dimaksud AC: filter
// berubah, bukan pengguna meminta halaman berikutnya.
//
// PEMULIHAN FOKUS (PR-059, AC "kembali ke list → fokus pulih"): route
// memberi tahu lowongan MANA yang tadi dibuka (`fokusLowonganId`); begitu
// kartunya ada di layar, fokus dikembalikan ke tautan "Lihat detail"-nya.
// Posisi gulir sendiri dipulihkan `<ScrollRestoration />` di `TataLetak`;
// `preventScroll` di sini menjaga posisi itu tidak ditimpa, dan
// `scrollIntoView({ block: "nearest" })` hanya bergerak bila tautannya
// ternyata di luar layar (mis. halaman belum sepanjang semula saat gulir
// dipulihkan).
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { jobsKeys, searchJobs, type ApiClient } from "@nawasena/api-client";
import type { JobSearchResponse } from "@nawasena/schemas";
import { KeadaanKosong, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import {
  FILTER_KOSONG,
  FilterPanel,
  MODE_KERJA_SEMUA,
  type NilaiFilterLowongan,
} from "./filter-panel.js";
import { keParamPencarian } from "./filter-url.js";
import { KartuLowongan } from "./kartu-lowongan.js";
import { pesanGalatLowongan } from "./pesan-galat.js";

/** Satu halaman = 20 — sama dengan bawaan `paginationQuerySchema` (server, PR-056). */
const PER_HALAMAN = 20;

type Halaman = JobSearchResponse;

function keFilterQuery(nilai: NilaiFilterLowongan) {
  const query = nilai.query.trim();
  const city = nilai.city.trim();
  const province = nilai.province.trim();
  return {
    query: query === "" ? undefined : query,
    city: city === "" ? undefined : city,
    province: province === "" ? undefined : province,
    workMode: nilai.workMode === MODE_KERJA_SEMUA ? undefined : nilai.workMode,
    accommodations: nilai.accommodations.length === 0 ? undefined : nilai.accommodations,
  };
}

function adaFilterAktif(nilai: NilaiFilterLowongan): boolean {
  return (
    nilai.query.trim() !== "" ||
    nilai.city.trim() !== "" ||
    nilai.province.trim() !== "" ||
    nilai.workMode !== MODE_KERJA_SEMUA ||
    nilai.accommodations.length > 0
  );
}

export interface DaftarBrowseLowonganProps {
  klien: ApiClient;
  /** Filter yang BERLAKU — sumbernya URL (lihat `filter-url.ts`). */
  filter: NilaiFilterLowongan;
  /** Terapkan filter baru (route menuliskannya ke URL). */
  onTerapkan: (nilai: NilaiFilterLowongan) => void;
  /** Lowongan yang tadi dibuka dari daftar ini — fokus dikembalikan ke kartunya. */
  fokusLowonganId?: string | null;
  /** Dipanggil saat pengguna membuka detail satu lowongan. */
  onBukaLowongan?: (id: string) => void;
  /** Dipanggil SEKALI setelah fokus berhasil dikembalikan. */
  onFokusDipulihkan?: () => void;
}

export function DaftarBrowseLowongan({
  klien,
  filter,
  onTerapkan,
  fokusLowonganId = null,
  onBukaLowongan,
  onFokusDipulihkan,
}: DaftarBrowseLowonganProps) {
  const t = useTeks();
  const [rancangan, setRancangan] = useState<NilaiFilterLowongan>(filter);

  // Filter bisa berubah dari LUAR form (tombol Kembali/Maju antar pencarian,
  // tautan yang dibagikan) — isian form diselaraskan, dibandingkan lewat
  // bentuk URL-nya supaya objek baru dengan isi sama tidak menimpa ketikan.
  const kunciFilter = keParamPencarian(filter).toString();
  const kunciTerselaras = useRef(kunciFilter);
  useEffect(() => {
    if (kunciTerselaras.current === kunciFilter) return;
    kunciTerselaras.current = kunciFilter;
    setRancangan(filter);
  }, [kunciFilter, filter]);

  const filterQuery = keFilterQuery(filter);
  const kunci = jobsKeys.search(filterQuery);

  const daftar = useInfiniteQuery({
    queryKey: kunci,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      searchJobs(klien, {
        ...filterQuery,
        limit: PER_HALAMAN,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (terakhir: Halaman) => terakhir.meta.nextCursor ?? undefined,
  });

  const halaman = daftar.data?.pages ?? [];
  const items = halaman.flatMap((h) => h.data);
  const jumlahHalamanPertama = halaman[0]?.data.length;
  const filterAktif = adaFilterAktif(filter);

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

  function resetFilter(): void {
    setRancangan(FILTER_KOSONG);
    onTerapkan(FILTER_KOSONG);
  }

  return (
    <div className="flex flex-col gap-6">
      <FilterPanel
        nilai={rancangan}
        onUbah={setRancangan}
        onCari={() => {
          onTerapkan(rancangan);
        }}
        onReset={resetFilter}
      />

      <PengumumanHasil
        kunciAktif={JSON.stringify(kunci)}
        jumlahHalamanPertama={jumlahHalamanPertama}
      />

      <section aria-labelledby="lowongan-hasil-judul" className="flex flex-col gap-4">
        {/* Judul bagian TIDAK terlihat (`sr-only`): halaman ini hanya punya satu
            bagian isi selain filter, dan judul visual di sini hanya akan
            mengulang apa yang sudah dikatakan `<h1>` — tetapi screen reader
            tetap butuh nama bagian untuk `aria-labelledby`. */}
        <h2 id="lowongan-hasil-judul" className="sr-only">
          {t("lowongan.judul")}
        </h2>

        {daftar.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-base font-medium text-red-700">{t("lowongan.gagalMuat")}</p>
            <p className="text-base text-gray-900">{pesanGalatLowongan(daftar.error, t)}</p>
            <Tombol
              varian="sekunder"
              onClick={() => {
                void daftar.refetch();
              }}
            >
              {t("companies.cobaLagi")}
            </Tombol>
          </div>
        ) : (
          <WilayahMemuat memuat={daftar.isPending} label={t("lowongan.memuat")}>
            {items.length === 0 ? (
              <KeadaanKosong
                tingkatJudul={3}
                judul={t("lowongan.hasil.kosong.judul")}
                aksi={
                  filterAktif ? (
                    <Tombol varian="sekunder" onClick={resetFilter}>
                      {t("lowongan.filter.reset")}
                    </Tombol>
                  ) : undefined
                }
              >
                {t(
                  filterAktif
                    ? "lowongan.hasil.kosong.penjelasanFilter"
                    : "lowongan.hasil.kosong.penjelasanPolos",
                )}
              </KeadaanKosong>
            ) : (
              <ul className="flex list-none flex-col gap-3 p-0">
                {items.map((l) => (
                  <li key={l.id}>
                    <KartuLowongan
                      lowongan={l}
                      refTautan={(el) => {
                        if (el === null) tautan.current.delete(l.id);
                        else tautan.current.set(l.id, el);
                      }}
                      onBuka={() => {
                        onBukaLowongan?.(l.id);
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
            {t("lowongan.muatLagi")}
          </Tombol>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Umumkan jumlah hasil TANPA mencuri fokus (AC "Jumlah hasil diumumkan
 * aria-live saat filter berubah") — `role="status"`, pola sama
 * `PengumumanNotifikasiBaru` (`app/lencana-notifikasi.tsx`).
 *
 * KEADAAN KOSONG SENGAJA TIDAK DIUMUMKAN DI SINI — `KeadaanKosong` (di atas)
 * sudah `role="status"` sendiri dan mengumumkan dirinya saat MUNCUL
 * (dipasang dinamis, bukan sejak render pertama). Mengumumkannya lagi di
 * sini berarti pengguna screen reader mendengarnya dua kali untuk satu
 * peristiwa yang sama.
 */
function PengumumanHasil({
  kunciAktif,
  jumlahHalamanPertama,
}: {
  kunciAktif: string;
  jumlahHalamanPertama: number | undefined;
}) {
  const t = useTeks();
  const [kalimat, setKalimat] = useState("");
  // Diinisialisasi ke KUNCI AWAL, bukan `null` — pemuatan PERTAMA (termasuk
  // saat kembali dari halaman detail) karena itu diam, sama seperti
  // `PengumumanNotifikasiBaru` tidak mengumumkan lencana pada render pertama.
  const terakhirDiumumkan = useRef(kunciAktif);

  useEffect(() => {
    if (jumlahHalamanPertama === undefined) return; // masih memuat
    if (jumlahHalamanPertama === 0) return; // KeadaanKosong yang mengumumkan
    if (terakhirDiumumkan.current === kunciAktif) return;
    terakhirDiumumkan.current = kunciAktif;
    setKalimat(t("lowongan.hasil.jumlah", { jumlah: jumlahHalamanPertama }));
  }, [kunciAktif, jumlahHalamanPertama, t]);

  return (
    <p role="status" className="sr-only">
      {kalimat}
    </p>
  );
}
