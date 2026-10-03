// Endpoint admin: metrik (PR-080 server; PR-081 dasbor) dan moderasi akun
// (PR-083a server; PR-083b halaman "Pengguna").
import {
  adminMetricsResponseSchema,
  adminUserListResponseSchema,
  adminUserResponseSchema,
  moderateUserSchema,
  type AdminMetrics,
  type AdminMetricsPeriod,
  type AdminUser,
  type AdminUserListResponse,
  type AdminUserStatus,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

export const adminKeys = {
  metrics: (periode: AdminMetricsPeriod) => queryKey("admin-metrics", { periode }),
  /** Daftar pengguna — dilingkupi saringan, tanpa cursor (pola `adminList` lamaran). */
  users: (filter: { q?: string; status?: AdminUserStatus }) =>
    queryKey("admin-users", { q: filter.q, status: filter.status }),
};

/** GET /api/v1/admin/metrics?periode= — agregat; server menyimpannya 5 menit. */
export async function getAdminMetrics(
  client: ApiClient,
  periode: AdminMetricsPeriod,
): Promise<AdminMetrics> {
  const res = await client.request(`/admin/metrics?periode=${encodeURIComponent(periode)}`, {
    responseSchema: adminMetricsResponseSchema,
  });
  return res.data;
}

export interface OpsiDaftarPengguna {
  q?: string;
  status?: AdminUserStatus;
  cursor?: string;
  limit?: number;
}

/** GET /api/v1/admin/users — satu halaman; amplop utuh untuk `meta.nextCursor`. */
export async function listUsersAdmin(
  client: ApiClient,
  opsi: OpsiDaftarPengguna = {},
): Promise<AdminUserListResponse> {
  const query = new URLSearchParams();
  if (opsi.q !== undefined && opsi.q.trim() !== "") query.set("q", opsi.q.trim());
  if (opsi.status !== undefined) query.set("status", opsi.status);
  if (opsi.cursor !== undefined) query.set("cursor", opsi.cursor);
  if (opsi.limit !== undefined) query.set("limit", String(opsi.limit));
  const akhiran = query.size === 0 ? "" : `?${query.toString()}`;
  return client.request(`/admin/users${akhiran}`, { responseSchema: adminUserListResponseSchema });
}

async function moderasi(
  client: ApiClient,
  id: string,
  aksi: "suspend" | "unsuspend",
  reason: string,
): Promise<AdminUser> {
  const res = await client.request(`/admin/users/${encodeURIComponent(id)}/${aksi}`, {
    method: "POST",
    body: moderateUserSchema.parse({ reason }),
    responseSchema: adminUserResponseSchema,
  });
  return res.data;
}

/** POST /api/v1/admin/users/:id/suspend — alasan wajib (audit, internal). */
export function suspendUserAdmin(client: ApiClient, id: string, reason: string) {
  return moderasi(client, id, "suspend", reason);
}

/** POST /api/v1/admin/users/:id/unsuspend — alasan wajib (audit, internal). */
export function unsuspendUserAdmin(client: ApiClient, id: string, reason: string) {
  return moderasi(client, id, "unsuspend", reason);
}
