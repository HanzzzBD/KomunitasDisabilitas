// Endpoint perusahaan admin (PR-051 di sisi server; dikonsumsi PR-053).
//
// EMPAT OPERASI, SATU BERKAS — pola yang sama dengan `profiles.ts`: daftar,
// buat, ubah, dan verifikasi adalah satu layar admin (`/admin/companies`),
// bukan empat konteks terpisah.
//
// TIDAK ADA `getCompanyAdmin` (GET satu perusahaan). Server memang tidak
// menyediakannya (PR-051 hanya punya GET publik tanpa field admin, dan GET
// daftar penuh) — daftar admin sengaja TANPA pagination untuk skala pilot,
// jadi satu perusahaan cukup dicari dari hasil `listCompaniesAdmin` yang
// sudah/akan di-cache TanStack Query, bukan lewat permintaan baru.
import {
  companyAdminListResponseSchema,
  companyAdminResponseSchema,
  createCompanySchema,
  updateCompanySchema,
  type CompanyAdmin,
} from "@nawasena/schemas";
import type { z } from "zod";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/**
 * Key cache TanStack untuk daftar admin.
 *
 * TANPA params: daftar penuh, sama untuk siapa pun admin yang memanggilnya —
 * beda dengan `profilesKeys` yang dilingkupi `sub` karena isinya data pribadi
 * SATU pengguna. Data perusahaan bukan data pribadi siapa pun.
 */
export const companiesKeys = {
  adminList: () => queryKey("admin-companies"),
};

/** Bentuk MASUKAN skema (`z.input`), bukan keluarannya — lihat alasan sama di `profiles.ts`. */
export type BuatPerusahaan = z.input<typeof createCompanySchema>;
export type UbahPerusahaan = z.input<typeof updateCompanySchema>;

/** GET /api/v1/admin/companies — seluruh perusahaan, tanpa pagination. */
export async function listCompaniesAdmin(client: ApiClient): Promise<CompanyAdmin[]> {
  const res = await client.request("/admin/companies", {
    responseSchema: companyAdminListResponseSchema,
  });
  return res.data;
}

/** POST /api/v1/admin/companies — status verifikasi selalu lahir `unverified`. */
export async function createCompanyAdmin(
  client: ApiClient,
  input: BuatPerusahaan,
): Promise<CompanyAdmin> {
  const res = await client.request("/admin/companies", {
    method: "POST",
    body: createCompanySchema.parse(input),
    responseSchema: companyAdminResponseSchema,
  });
  return res.data;
}

/**
 * PUT /api/v1/admin/companies/:id — perubahan SEBAGIAN.
 *
 * `inclusivityStatus` di `updateCompanySchema` HANYA menerima
 * `unverified`/`self_claimed` (lihat komentar `editableInclusivityStatusSchema`
 * di `@nawasena/schemas/companies`) — validasi ini menolak `"verified"` di
 * SINI, sebelum satu permintaan pun berangkat, bukan hanya di server.
 */
export async function updateCompanyAdmin(
  client: ApiClient,
  id: string,
  input: UbahPerusahaan,
): Promise<CompanyAdmin> {
  const res = await client.request(`/admin/companies/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: updateCompanySchema.parse(input),
    responseSchema: companyAdminResponseSchema,
  });
  return res.data;
}

/**
 * POST /api/v1/admin/companies/:id/verify — satu-satunya jalan menuju
 * `inclusivityStatus: "verified"`. Tanpa badan permintaan: siapa (dari sesi)
 * dan kapan (jam server) ditentukan server, bukan klien.
 */
export async function verifyCompanyAdmin(client: ApiClient, id: string): Promise<CompanyAdmin> {
  const res = await client.request(`/admin/companies/${encodeURIComponent(id)}/verify`, {
    method: "POST",
    responseSchema: companyAdminResponseSchema,
  });
  return res.data;
}
