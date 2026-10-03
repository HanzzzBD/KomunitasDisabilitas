// Endpoint metrik admin (PR-080 server; PR-081 konsumen pertama).
import { describe, expect, it, vi } from "vitest";
import { adminKeys, createApiClient, getAdminMetrics } from "../src/index.js";

const METRIK = {
  period: "30d",
  from: "2026-09-02T00:00:00.000Z",
  to: "2026-10-02T00:00:00.000Z",
  generatedAt: "2026-10-02T00:00:00.000Z",
  funnel: { registered: 5, profileReady: 4, applied: 3, interviewed: 2, hired: 1 },
  northStar: { confirmedInPeriod: 1, confirmedTotal: 2 },
  previous: null,
  aiUsage: { since: "2026-09-02T00:00:00.000Z", features: [] },
  dlqTotal: null,
};

describe("getAdminMetrics", () => {
  it("mengirim periode sebagai query dan membuka amplop", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: METRIK }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const klien = createApiClient({
      baseUrl: "https://x/api/v1",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const hasil = await getAdminMetrics(klien, "7d");
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://x/api/v1/admin/metrics?periode=7d");
    expect(hasil.funnel.registered).toBe(5);
    expect(adminKeys.metrics("7d")).not.toEqual(adminKeys.metrics("30d"));
  });
});
