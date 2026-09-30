// Endpoint feed AI Job Matching (PR-073 di sisi server; dikonsumsi PR-074).
//
// DUA OPERASI, DAN YANG KEDUA BUKAN GET BERPARAMETER. `refreshMatches` adalah
// POST terpisah karena ia MEMAKAN jatah harian (keputusan owner 2026-09-30):
// GET yang diulang otomatis (retry, prefetch) tidak boleh bisa membakarnya.
//
// Keduanya mengembalikan AMPLOP UTUH (`{ data, meta }`): `meta` di sini bukan
// sekadar pagination — `degraded`, `aiMenyusun`, `sisaRefresh`, dan
// `alasanKosong` adalah bagian dari apa yang ditampilkan halaman.
import { matchesResponseSchema, type MatchesResponse } from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/**
 * Key cache feed — DILINGKUPI PEMILIKNYA (`sub`), alasan sama `profilesKeys`:
 * cache TanStack hidup selama dokumen, `keluar()` tidak membuangnya, dan feed
 * ini adalah hasil hard filter atas kebutuhan akomodasi seseorang — daftar
 * yang tidak boleh terbaca pengguna berikutnya di tab yang sama.
 *
 * TANPA `cursor`: posisi halaman dipegang `useInfiniteQuery` lewat
 * `pageParam` (pola `jobsKeys.search`).
 */
export const matchingKeys = {
  feed: (sub: string | null) => queryKey("me-matches", { sub: sub ?? "anonim" }),
};

export interface OpsiFeedMatching {
  cursor?: string;
  /** 1–50 (server). */
  limit?: number;
}

function akhiranQuery(opsi: OpsiFeedMatching): string {
  const query = new URLSearchParams();
  if (opsi.cursor !== undefined) query.set("cursor", opsi.cursor);
  if (opsi.limit !== undefined) query.set("limit", String(opsi.limit));
  return query.size === 0 ? "" : `?${query.toString()}`;
}

/** GET /api/v1/me/matches — satu halaman feed milik pemanggil. */
export async function listMatches(
  client: ApiClient,
  opsi: OpsiFeedMatching = {},
): Promise<MatchesResponse> {
  return client.request(`/me/matches${akhiranQuery(opsi)}`, {
    responseSchema: matchesResponseSchema,
  });
}

/**
 * POST /api/v1/me/matches/refresh — hitung ulang feed (1 jatah bila tersisa).
 * Jatah habis BUKAN error: server mengembalikan feed yang ada dengan
 * `meta.sisaRefresh: 0`. Selalu halaman 1, jadi tanpa `cursor`.
 */
export async function refreshMatches(
  client: ApiClient,
  opsi: Pick<OpsiFeedMatching, "limit"> = {},
): Promise<MatchesResponse> {
  return client.request(`/me/matches/refresh${akhiranQuery(opsi)}`, {
    method: "POST",
    responseSchema: matchesResponseSchema,
  });
}
