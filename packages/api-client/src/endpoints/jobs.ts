// Endpoint lowongan admin (PR-055 di sisi server; dikonsumsi PR-057).
//
// LIMA OPERASI, SATU BERKAS — pola yang sama dengan `companies.ts`: daftar,
// buat, ubah, terbitkan, dan tutup adalah satu layar admin (`/admin/jobs`),
// bukan konteks terpisah.
//
// TIDAK ADA `getJobAdmin` (GET satu lowongan) DAN TIDAK ADA `deleteJobAdmin`.
// Server memang tidak menyediakan GET satu lowongan admin (pola sama
// `companies.ts` — daftar admin sengaja TANPA pagination untuk skala pilot,
// jadi satu baris cukup dicari dari `listJobsAdmin` yang sudah/akan di-cache).
// `DELETE /admin/jobs/:id` ADA di server (PR-055) tetapi TIDAK diekspos di
// sini — PR-057 tidak punya AC yang memintanya; "close" adalah jalur resmi
// menyingkirkan lowongan dari pandangan publik (lihat komentar
// `jobs.service.ts` sisi server), dan itulah satu-satunya jalur yang UI ini
// sediakan.
import {
  createJobSchema,
  jobAdminListResponseSchema,
  jobAdminResponseSchema,
  updateJobSchema,
  type JobAdmin,
} from "@nawasena/schemas";
import type { z } from "zod";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/** Key cache TanStack untuk daftar admin — TANPA params, sama alasannya dengan `companiesKeys.adminList`. */
export const jobsKeys = {
  adminList: () => queryKey("admin-jobs"),
};

/** Bentuk MASUKAN skema (`z.input`), bukan keluarannya — lihat alasan sama di `companies.ts`. */
export type BuatLowongan = z.input<typeof createJobSchema>;
export type UbahLowongan = z.input<typeof updateJobSchema>;

/** GET /api/v1/admin/jobs — seluruh lowongan, tanpa pagination. */
export async function listJobsAdmin(client: ApiClient): Promise<JobAdmin[]> {
  const res = await client.request("/admin/jobs", {
    responseSchema: jobAdminListResponseSchema,
  });
  return res.data;
}

/** POST /api/v1/admin/jobs — lowongan selalu lahir `draft` + `admin_curated`. */
export async function createJobAdmin(client: ApiClient, input: BuatLowongan): Promise<JobAdmin> {
  const res = await client.request("/admin/jobs", {
    method: "POST",
    body: createJobSchema.parse(input),
    responseSchema: jobAdminResponseSchema,
  });
  return res.data;
}

/**
 * PUT /api/v1/admin/jobs/:id — perubahan SEBAGIAN. TIDAK bisa mengubah
 * `companyId` maupun `status` — satu-satunya jalan ke status ada di
 * `publishJobAdmin`/`closeJobAdmin` (lihat `updateJobSchema`).
 */
export async function updateJobAdmin(
  client: ApiClient,
  id: string,
  input: UbahLowongan,
): Promise<JobAdmin> {
  const res = await client.request(`/admin/jobs/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: updateJobSchema.parse(input),
    responseSchema: jobAdminResponseSchema,
  });
  return res.data;
}

/**
 * POST /api/v1/admin/jobs/:id/publish — satu-satunya jalan menuju
 * `status: "published"`. Menolak (409) selain dari `draft`, dan (422) bila
 * akomodasi kosong — validasi client-side yang SAMA ada di `jobs-formulir.tsx`
 * (AC "Validasi akomodasi wajib sebelum publish (server+client)"), tetapi
 * server tetap sumber kebenaran akhir.
 */
export async function publishJobAdmin(client: ApiClient, id: string): Promise<JobAdmin> {
  const res = await client.request(`/admin/jobs/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    responseSchema: jobAdminResponseSchema,
  });
  return res.data;
}

/** POST /api/v1/admin/jobs/:id/close — satu-satunya jalan admin menuju `status: "closed"`. */
export async function closeJobAdmin(client: ApiClient, id: string): Promise<JobAdmin> {
  const res = await client.request(`/admin/jobs/${encodeURIComponent(id)}/close`, {
    method: "POST",
    responseSchema: jobAdminResponseSchema,
  });
  return res.data;
}
