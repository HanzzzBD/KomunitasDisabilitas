// Endpoint lamaran — jalur ADMIN (PR-077a server; dikonsumsi PR-077b) dan
// melamar (PR-075 server; dikonsumsi PR-078) dan "Lamaran Saya" (PR-076
// server; dikonsumsi PR-079).
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
  myApplicationDetailResponseSchema,
  myApplicationListResponseSchema,
  revealDisclosureSchema,
  updateApplicationStatusSchema,
  type AdminApplicationDetail,
  type AdminApplicationListResponse,
  type Application,
  type ApplicationStatus,
  type ApplyJob,
  type DisclosureSnapshot,
  type MyApplicationDetail,
  type MyApplicationListResponse,
} from "@nawasena/schemas";
import type { z } from "zod";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

export const applicationsKeys = {
  /**
   * Daftar admin — dilingkupi FILTER, tanpa `cursor` (pola `jobsKeys.search`:
   * `useInfiniteQuery` memegang halaman lewat `pageParam`).
   */
  adminList: (filter: {
    jobId?: string;
    status?: ApplicationStatus;
    termasukDitangguhkan?: boolean;
  }) =>
    queryKey("admin-applications", {
      jobId: filter.jobId,
      status: filter.status,
      termasukDitangguhkan: filter.termasukDitangguhkan === true ? true : undefined,
    }),
  adminDetail: (id: string) => queryKey("admin-application", { id }),
  /**
   * "Lamaran Saya" (PR-079) — dilingkupi `sub` seperti `resumesKeys`: pengguna
   * yang berganti akun di tab yang sama tidak boleh melihat cache milik akun
   * sebelumnya. `jobId` = pertanyaan "sudah melamar lowongan ini?".
   */
  myList: (sub: string | null, filter: { jobId?: string } = {}) =>
    queryKey("my-applications", { sub: sub ?? "anonim", jobId: filter.jobId }),
  myDetail: (sub: string | null, id: string) =>
    queryKey("my-application", { sub: sub ?? "anonim", id }),
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
  /** PR-083 — sertakan lamaran dari akun yang ditangguhkan (bawaan: disembunyikan). */
  termasukDitangguhkan?: boolean;
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
  if (opsi.termasukDitangguhkan === true) query.set("termasuk_ditangguhkan", "true");
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

export interface OpsiDaftarLamaranSaya {
  jobId?: string;
  cursor?: string;
  limit?: number;
}

/** GET /api/v1/me/applications — satu halaman; amplop utuh untuk `meta.nextCursor`. */
export async function listMyApplications(
  client: ApiClient,
  opsi: OpsiDaftarLamaranSaya = {},
): Promise<MyApplicationListResponse> {
  const query = new URLSearchParams();
  if (opsi.jobId !== undefined) query.set("job_id", opsi.jobId);
  if (opsi.cursor !== undefined) query.set("cursor", opsi.cursor);
  if (opsi.limit !== undefined) query.set("limit", String(opsi.limit));
  const akhiran = query.size === 0 ? "" : `?${query.toString()}`;
  return client.request(`/me/applications${akhiran}`, {
    responseSchema: myApplicationListResponseSchema,
  });
}

/** GET /api/v1/me/applications/:id — dengan riwayat status. */
export async function getMyApplication(
  client: ApiClient,
  id: string,
): Promise<MyApplicationDetail> {
  const res = await client.request(`/me/applications/${encodeURIComponent(id)}`, {
    responseSchema: myApplicationDetailResponseSchema,
  });
  return res.data;
}

/** POST /api/v1/me/applications/:id/withdraw — hanya dari status aktif. */
export async function withdrawMyApplication(
  client: ApiClient,
  id: string,
): Promise<MyApplicationDetail> {
  const res = await client.request(`/me/applications/${encodeURIComponent(id)}/withdraw`, {
    method: "POST",
    responseSchema: myApplicationDetailResponseSchema,
  });
  return res.data;
}

/**
 * POST /api/v1/me/applications/:id/confirm-hired — North Star (PRD FR-5.5).
 * Idempoten di server: konfirmasi kedua menjawab keadaan yang sama.
 */
export async function confirmHiredMyApplication(
  client: ApiClient,
  id: string,
): Promise<MyApplicationDetail> {
  const res = await client.request(`/me/applications/${encodeURIComponent(id)}/confirm-hired`, {
    method: "POST",
    responseSchema: myApplicationDetailResponseSchema,
  });
  return res.data;
}
