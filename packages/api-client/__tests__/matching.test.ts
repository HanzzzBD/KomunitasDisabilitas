// Endpoint feed matching (PR-073 server; PR-074 konsumen).
import { describe, expect, it, vi } from "vitest";
import { createApiClient, listMatches, matchingKeys, refreshMatches } from "../src/index.js";

const RESPON = {
  data: [
    {
      job: {
        id: "01912345-89ab-7def-8123-456789abcdef",
        companyId: "01912345-89ab-7def-8123-4567890abd01",
        companyName: "PT Uji",
        title: "Staf Admin",
        employmentType: "full_time",
        workMode: "remote",
        city: null,
        province: null,
        accommodations: ["jam_kerja_fleksibel"],
        publishedAt: "2026-09-01T00:00:00.000Z",
      },
      score: 0.73,
      explanation: "Cocok: bisa kerja dari rumah (remote).",
      explanationSource: "template",
    },
  ],
  meta: {
    nextCursor: "abc",
    degraded: true,
    aiMenyusun: false,
    sisaRefresh: 2,
    diperbaruiPada: "2026-09-30T05:00:00.000Z",
    alasanKosong: null,
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function klien(fetch: ReturnType<typeof vi.fn>) {
  return createApiClient({
    baseUrl: "https://x/api/v1",
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
}

describe("listMatches", () => {
  it("GET /me/matches tanpa query; amplop utuh termasuk meta", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, RESPON));
    const hasil = await listMatches(klien(fetch));
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/me/matches");
    expect(hasil.meta).toMatchObject({ degraded: true, sisaRefresh: 2 });
    expect(hasil.data[0]?.job.companyName).toBe("PT Uji");
  });

  it("cursor & limit ikut sebagai query", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, RESPON));
    await listMatches(klien(fetch), { cursor: "a/b", limit: 10 });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/me/matches?cursor=a%2Fb&limit=10");
  });

  it("respons yang menyimpang dari kontrak ditolak", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [], meta: {} }));
    await expect(listMatches(klien(fetch))).rejects.toThrow();
  });
});

describe("refreshMatches", () => {
  it("POST /me/matches/refresh", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, RESPON));
    await refreshMatches(klien(fetch), { limit: 20 });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/me/matches/refresh?limit=20");
    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
  });
});

describe("matchingKeys", () => {
  it("kunci feed dilingkupi pemilik, tanpa cursor", () => {
    expect(matchingKeys.feed("u-1")).toEqual(["me-matches", { sub: "u-1" }]);
    expect(matchingKeys.feed("u-1")).not.toEqual(matchingKeys.feed("u-2"));
    expect(matchingKeys.feed(null)).toEqual(["me-matches", { sub: "anonim" }]);
  });
});
