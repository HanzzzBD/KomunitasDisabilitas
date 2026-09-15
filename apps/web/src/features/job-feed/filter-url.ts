// Filter pencarian lowongan ↔ query string URL (PR-059).
//
// FILTER YANG DITERAPKAN HIDUP DI URL, bukan di state komponen — satu-satunya
// cara tombol Kembali dari halaman detail mengembalikan pencarian yang SAMA
// (AC PR-059 "kembali ke list → posisi scroll & fokus pulih"): state lokal
// lenyap saat halaman daftar dilepas, alamatnya tidak. Bonusnya, pencarian
// bisa dibagikan lewat tautan.
//
// NAMA PARAMETER SAMA PERSIS DENGAN `GET /jobs` (`query`, `city`, `province`,
// `workMode`, `accommodations` berulang) — dua kosakata untuk satu filter
// adalah dua kosakata yang suatu saat berbeda.
//
// Tidak menyentuh router maupun DOM — hanya `URLSearchParams`.
import { ACCOMMODATION_NEEDS, workModeSchema, type AccommodationNeed } from "@nawasena/schemas";
import { MODE_KERJA_SEMUA, type NilaiFilterLowongan } from "./filter-panel.js";

/** Nilai form → query string. Kolom kosong TIDAK ditulis — alamat tetap pendek dan setara. */
export function keParamPencarian(nilai: NilaiFilterLowongan): URLSearchParams {
  const param = new URLSearchParams();
  const query = nilai.query.trim();
  const city = nilai.city.trim();
  const province = nilai.province.trim();
  if (query !== "") param.set("query", query);
  if (city !== "") param.set("city", city);
  if (province !== "") param.set("province", province);
  if (nilai.workMode !== MODE_KERJA_SEMUA) param.set("workMode", nilai.workMode);
  // Diurutkan: dua pilihan yang sama dalam urutan centang berbeda menghasilkan
  // alamat yang sama — satu entri cache peramban, satu kunci TanStack.
  for (const akomodasi of [...nilai.accommodations].sort()) {
    param.append("accommodations", akomodasi);
  }
  return param;
}

/**
 * Query string → nilai form. Alamat datang dari LUAR (tautan dibagikan,
 * diketik tangan), jadi setiap nilai yang tidak dikenali DIBUANG — bukan
 * diteruskan ke server untuk ditolak 400 dan meninggalkan halaman galat.
 */
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
