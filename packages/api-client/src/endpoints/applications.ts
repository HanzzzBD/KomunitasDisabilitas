// Endpoint lamaran — jalur ADMIN (PR-077a server; dikonsumsi PR-077b) dan
// melamar (PR-075 server; dikonsumsi PR-078). "Lamaran Saya" menyusul bersama
// layarnya di PR-079, di berkas yang sama.
//
// `revealDisclosureAdmin` SENGAJA TIDAK PUNYA query key. Salinan data
// disabilitas tidak boleh tinggal di cache TanStack: setiap pembukaan harus
// melewati server (yang menulis jejak audit), bukan disajikan ulang dari
// memori peramban kepada siapa pun yang membuka halaman yang sama berikutnya.
import {
  adminApplicationDetailResponseSchema,
  adminApplicationListResponseSchema,
  applicationResponseSchema,
  applyJobSchema,
  disclosureSnapshotResponseSchema,
  revealDisclosureSchema,
  updateApplicationStatusSchema,
  type AdminApplicationDetail,
  type AdminApplicationListResponse,
  type Application,
  type ApplicationStatus,
  type ApplyJob,
  type DisclosureSnapshot,
} from "@nawasena/schemas";
import type { z } from "zod";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

export const applicationsKeys = {
  /**
   * Daftar admin — dilingkupi FILTER, tanpa `cursor` (pola `jobsKeys.search`:
   * `useInfiniteQuery` memegang halaman lewat `pageParam`).
   */
  adminList: (filter: { jobId?: string; status?: ApplicationStatus }) =>
    queryKey("admin-applications", { jobId: filter.jobId, status: filter.status }),
  adminDetail: (id: string) => queryKey("admin-application", { id }),
};

/**
 * POST /api/v1/jobs/:id/apply — melamar dengan keputusan pengungkapan eksplisit.
 *
 * `idempotencyKey` disediakan PEMANGGIL, bukan dibangkitkan di sini: kunci yang
 * lahir di dalam fungsi ini akan berbeda pada setiap panggilan, sehingga klik
 * ganda atau percobaan ulang sesudah koneksi putus menjadi dua permintaan
 * berbeda — persis yang hendak dicegah. Pemanggil memegang SATU kunci per
 * percobaan melamar dan mengirimnya ulang apa adanya.
 */
export async function applyJob(
  client: ApiClient,
  jobId: string,
  input: ApplyJob,
  idempotencyKey: string,
): Promise<Application> {
  const res = await client.request(`/jobs/${encodeURIComponent(jobId)}/apply`, {
    method: "POST",
    body: applyJobSchema.parse(input),
    headers: { "Idempotency-Key": idempotencyKey },
    responseSchema: applicationResponseSchema,
  });
  return res.data;
}

export interface OpsiDaftarLamaranAdmin {
  jobId?: string;
  status?: ApplicationStatus;
  cursor?: string;
  limit?: number;
}

/** GET /api/v1/admin/applications — satu halaman; amplop utuh untuk `meta.nextCursor`. */
export async function listApplicationsAdmin(
  client: ApiClient,
  opsi: OpsiDaftarLamaranAdmin = {},
): Promise<AdminApplicationListResponse> {
  const query = new URLSearchParams();
  if (opsi.jobId !== undefined) query.set("job_id", opsi.jobId);
  if (opsi.status !== undefined) query.set("status", opsi.status);
  if (opsi.cursor !== undefined) query.set("cursor", opsi.cursor);
  if (opsi.limit !== undefined) query.set("limit", String(opsi.limit));
  const akhiran = query.size === 0 ? "" : `?${query.toString()}`;
  return client.request(`/admin/applications${akhiran}`, {
    responseSchema: adminApplicationListResponseSchema,
  });
}

/** GET /api/v1/admin/applications/:id — kontak + CV + riwayat, tanpa data disabilitas. */
export async function getApplicationAdmin(
  client: ApiClient,
  id: string,
): Promise<AdminApplicationDetail> {
  const res = await client.request(`/admin/applications/${encodeURIComponent(id)}`, {
    responseSchema: adminApplicationDetailResponseSchema,
  });
  return res.data;
}

export type UbahStatusLamaran = z.input<typeof updateApplicationStatusSchema>;

/** PUT /api/v1/admin/applications/:id/status — alasan wajib (masuk audit). */
export async function updateApplicationStatusAdmin(
  client: ApiClient,
  id: string,
  input: UbahStatusLamaran,
): Promise<AdminApplicationDetail> {
  const res = await client.request(`/admin/applications/${encodeURIComponent(id)}/status`, {
    method: "PUT",
    body: updateApplicationStatusSchema.parse(input),
    responseSchema: adminApplicationDetailResponseSchema,
  });
  return res.data;
}

/** POST /api/v1/admin/applications/:id/disclosure — buka salinan yang diungkap (ber-audit). */
export async function revealDisclosureAdmin(
  client: ApiClient,
  id: string,
  reason: string,
): Promise<DisclosureSnapshot> {
  const res = await client.request(`/admin/applications/${encodeURIComponent(id)}/disclosure`, {
    method: "POST",
    body: revealDisclosureSchema.parse({ reason }),
    responseSchema: disclosureSnapshotResponseSchema,
  });
  return res.data;
}
