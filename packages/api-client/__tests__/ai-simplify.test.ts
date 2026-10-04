// Endpoint "Sederhanakan" (PR-087).
import { describe, expect, it, vi } from "vitest";
import { createApiClient, simplifyText } from "../src/index.js";

const JOB = "01912345-89ab-7def-8123-4567890abe01";

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

describe("simplifyText", () => {
  it("POST rujukan lowongan; mengembalikan teks sederhana", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { data: { teks: "Anda mengurus dokumen.", alasan: null } }),
      );
    const hasil = await simplifyText(klien(fetch), {
      sumber: "lowongan",
      id: JOB,
      bagian: "deskripsi",
    });

    expect(hasil).toEqual({ teks: "Anda mengurus dokumen.", alasan: null });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://x/api/v1/ai/simplify-text");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      sumber: "lowongan",
      id: JOB,
      bagian: "deskripsi",
    });
  });

  it("degradasi BUKAN error: alasan terisi, teks null", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { teks: null, alasan: "kuota_habis" },
        meta: { degraded: true },
      }),
    );
    await expect(
      simplifyText(klien(fetch), { sumber: "lowongan", id: JOB, bagian: "persyaratan" }),
    ).resolves.toEqual({ teks: null, alasan: "kuota_habis" });
  });

  it("body tak sah ditolak SEBELUM jaringan", async () => {
    const fetch = vi.fn();
    await expect(
      simplifyText(klien(fetch), {
        sumber: "lowongan",
        id: "bukan-uuid",
        bagian: "deskripsi",
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
