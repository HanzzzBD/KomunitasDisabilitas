// Nilai filter pencarian lowongan (dipindah dari apps/web, PR-058/059 → PR-093).
//
// Nama field SAMA PERSIS dengan `GET /jobs` (`query`, `city`, `province`,
// `workMode`, `accommodations`) — dua kosakata untuk satu filter adalah dua
// kosakata yang suatu saat berbeda.
import {
  ACCOMMODATION_NEEDS,
  workModeSchema,
  type AccommodationNeed,
  type WorkMode,
} from "@nawasena/schemas";

export const MODE_KERJA_SEMUA = "semua" as const;

/** Nilai form filter — SELALU string/array pilihan, pola sama formulir lain. */
export interface NilaiFilterLowongan {
  query: string;
  city: string;
  province: string;
  workMode: WorkMode | typeof MODE_KERJA_SEMUA;
  accommodations: readonly AccommodationNeed[];
}

export const FILTER_KOSONG: NilaiFilterLowongan = {
  query: "",
  city: "",
  province: "",
  workMode: MODE_KERJA_SEMUA,
  accommodations: [],
};

/** Bentuk opsi `searchJobs` (api-client), tanpa cursor/limit. */
export interface OpsiFilterLowongan {
  query?: string;
  city?: string;
  province?: string;
  workMode?: WorkMode;
  accommodations?: readonly AccommodationNeed[];
}

/**
 * Nilai form → opsi pencarian: teks dirapikan, kosong dibuang, akomodasi
 * diurutkan — dua pilihan sama dalam urutan centang berbeda menghasilkan opsi
 * (dan kunci query TanStack) yang sama.
 */
export function keOpsiPencarian(nilai: NilaiFilterLowongan): OpsiFilterLowongan {
  const opsi: OpsiFilterLowongan = {};
  const query = nilai.query.trim();
  const city = nilai.city.trim();
  const province = nilai.province.trim();
  if (query !== "") opsi.query = query;
  if (city !== "") opsi.city = city;
  if (province !== "") opsi.province = province;
  if (nilai.workMode !== MODE_KERJA_SEMUA) opsi.workMode = nilai.workMode;
  if (nilai.accommodations.length > 0) opsi.accommodations = [...nilai.accommodations].sort();
  return opsi;
}

/** Jumlah filter aktif (selain kata kunci) — untuk ringkasan "2 filter aktif". */
export function jumlahFilterAktif(nilai: NilaiFilterLowongan): number {
  return (
    (nilai.city.trim() === "" ? 0 : 1) +
    (nilai.province.trim() === "" ? 0 : 1) +
    (nilai.workMode === MODE_KERJA_SEMUA ? 0 : 1) +
    nilai.accommodations.length
  );
}

export function keParamPencarian(nilai: NilaiFilterLowongan): URLSearchParams {
  const opsi = keOpsiPencarian(nilai);
  const param = new URLSearchParams();
  if (opsi.query !== undefined) param.set("query", opsi.query);
  if (opsi.city !== undefined) param.set("city", opsi.city);
  if (opsi.province !== undefined) param.set("province", opsi.province);
  if (opsi.workMode !== undefined) param.set("workMode", opsi.workMode);
  for (const a of opsi.accommodations ?? []) param.append("accommodations", a);
  return param;
}

/** Parameter dari luar (URL) TIDAK dipercaya: mode & akomodasi asing dibuang. */
export function dariParamPencarian(param: URLSearchParams): NilaiFilterLowongan {
  const mode = workModeSchema.safeParse(param.get("workMode"));
  const dikenal: readonly string[] = ACCOMMODATION_NEEDS;
  const akomodasi = param
    .getAll("accommodations")
    .filter((a): a is AccommodationNeed => dikenal.includes(a));

  return {
    query: param.get("query") ?? "",
    city: param.get("city") ?? "",
    province: param.get("province") ?? "",
    workMode: mode.success ? mode.data : MODE_KERJA_SEMUA,
    accommodations: [...new Set(akomodasi)],
  };
}
