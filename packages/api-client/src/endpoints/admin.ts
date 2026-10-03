// Endpoint metrik admin (PR-080 server; dikonsumsi PR-081 dashboard).
import {
  adminMetricsResponseSchema,
  type AdminMetrics,
  type AdminMetricsPeriod,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

export const adminKeys = {
  metrics: (periode: AdminMetricsPeriod) => queryKey("admin-metrics", { periode }),
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
