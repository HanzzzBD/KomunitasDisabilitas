import { describe, expect, it, vi } from "vitest";
import { createApiClient, listNotifications } from "../src/index.js";

describe("notifikasi mobile: pembatalan permintaan", () => {
  it("meneruskan AbortSignal tanpa mengubah query HTTP", async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Response(
        JSON.stringify({ data: [], meta: { nextCursor: null, unreadCount: 8 } }),
        { status: 200 },
      );
    });
    const client = createApiClient({ baseUrl: "https://test/api/v1", fetch });
    const result = await listNotifications(
      client,
      { limit: 20, unreadOnly: true },
      controller.signal,
    );
    expect(result.meta.unreadCount).toBe(8);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://test/api/v1/me/notifications?limit=20&unreadOnly=true",
    );
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    controller.abort();
    await expect(listNotifications(client, {}, controller.signal)).rejects.toThrow();
  });
});
