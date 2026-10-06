import { dataExportResponseSchema, type DataExportResponse } from "@nawasena/schemas";
import type { ApiClient } from "../client.js";

/**
 * GET /me/export — seluruh data pribadi pemilik sesi (hak portabilitas UU PDP
 * §8.7; PR-022 di sisi server, dikonsumsi PR-033b).
 *
 * TIDAK ADA `queryKey` UNTUK ENDPOINT INI, DAN ITU DISENGAJA. Meski `GET`, ia
 * bukan pembacaan yang boleh diulang sesuka cache: tiap panggilan memakan kuota
 * (3× per 24 jam) dan tercatat di audit. Dipakai lewat `useQuery`, ia akan
 * berjalan sendiri saat komponen dipasang dan berpotensi berjalan lagi saat
 * data dianggap basi — menghabiskan jatah pengguna tanpa ia menekan apa pun.
 * Pemakainya WAJIB `useMutation`, dan ketiadaan key di sini yang membuat jalan
 * yang salah itu tidak tersedia.
 *
 * Response diparse `dataExportResponseSchema`: berkas yang diserahkan ke
 * pengguna adalah janji jangka panjang (`formatVersion`), jadi bentuk yang
 * menyimpang harus gagal di sini — bukan mendarat di berkas unduhan seseorang.
 */
export async function exportMe(client: ApiClient): Promise<DataExportResponse> {
  return client.request("/me/export", { responseSchema: dataExportResponseSchema });
}
