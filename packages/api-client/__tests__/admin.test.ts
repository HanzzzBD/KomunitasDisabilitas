// Endpoint metrik admin (PR-080 server; PR-081 konsumen pertama).
import { describe, expect, it, vi } from "vitest";
import {
  adminKeys,
  createApiClient,
  getAdminMetrics,
  listUsersAdmin,
  suspendUserAdmin,
  unsuspendUserAdmin,
} from "../src/index.js";

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

describe("moderasi akun (PR-083)", () => {
  const AKUN = {
    id: "01912345-89ab-7def-8123-456789abcdef",
    fullName: "Rina",
    phone: "+6281200000000",
    email: null,
    role: "seeker",
    createdAt: "2026-10-01T00:00:00.000Z",
    suspendedAt: "2026-10-03T00:00:00.000Z",
    suspendReason: "tiket #1",
  };
  const json = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  const klien = (fetch: ReturnType<typeof vi.fn>) =>
    createApiClient({
      baseUrl: "https://x/api/v1",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

  it("daftar mengirim q (dipangkas) & status; q kosong tidak dikirim", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => json({ data: [AKUN], meta: { nextCursor: null } }));
    await listUsersAdmin(klien(fetch), { q: " rina ", status: "ditangguhkan" });
    await listUsersAdmin(klien(fetch), { q: "  " });
    const urls = fetch.mock.calls.map((c) => new URL(String(c[0])));
    expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({
      q: "rina",
      status: "ditangguhkan",
    });
    expect(urls[1]!.search).toBe("");
  });

  it("tangguhkan/pulihkan = POST alasan; alasan kosong ditolak sebelum berangkat", async () => {
    const fetch = vi.fn().mockImplementation(() => json({ data: AKUN }));
    await suspendUserAdmin(klien(fetch), AKUN.id, "tiket #1");
    await unsuspendUserAdmin(klien(fetch), AKUN.id, "banding diterima");
    const calls = fetch.mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]![0]).toBe(`https://x/api/v1/admin/users/${AKUN.id}/suspend`);
    expect(calls[1]![0]).toBe(`https://x/api/v1/admin/users/${AKUN.id}/unsuspend`);
    expect(JSON.parse(String(calls[0]![1].body))).toEqual({ reason: "tiket #1" });
    await expect(suspendUserAdmin(klien(fetch), AKUN.id, " ")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
