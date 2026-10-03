// Filter kamus ↔ query string (PR-086). Pola sama `job-feed/filter-url.ts`:
// filter di URL supaya tombol Kembali dari halaman detail mengembalikan
// pencarian yang sama, dan pencarian bisa dibagikan.
import { signVideoCategorySchema, type SignVideoCategory } from "@nawasena/schemas";

export interface FilterKamus {
  query?: string;
  category?: SignVideoCategory;
}

/** Nilai liar di URL diabaikan diam-diam — URL ketikan tangan tidak boleh menjatuhkan halaman. */
export function dariParam(param: URLSearchParams): FilterKamus {
  const query = param.get("q")?.trim() ?? "";
  const kategori = signVideoCategorySchema.safeParse(param.get("kategori"));
  return {
    ...(query === "" ? {} : { query: query.slice(0, 100) }),
    ...(kategori.success ? { category: kategori.data } : {}),
  };
}

export function keParam(filter: FilterKamus): URLSearchParams {
  const param = new URLSearchParams();
  if (filter.query !== undefined && filter.query !== "") param.set("q", filter.query);
  if (filter.category !== undefined) param.set("kategori", filter.category);
  return param;
}

/** `0:07` — detik → menit:detik, untuk teks waktu pemutar. */
export function formatWaktu(detik: number): string {
  const aman = Number.isFinite(detik) && detik > 0 ? Math.floor(detik) : 0;
  return `${Math.floor(aman / 60)}:${String(aman % 60).padStart(2, "0")}`;
}
