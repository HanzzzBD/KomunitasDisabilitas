import { describe, expect, it, vi } from "vitest";
import { createApiClient, registerMyDevice, unregisterMyDevice } from "../src/index.js";

const ID = "01912345-89ab-7def-8123-456789abcdef";
describe("perangkat mobile PR-094", () => {
  it("registrasi divalidasi, token hanya dikirim dalam request", async () => {
    const device = {
      id: ID,
      platform: "android",
      lastSeenAt: "2026-10-05T00:00:00Z",
      createdAt: "2026-10-05T00:00:00Z",
    };
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ data: device }), { status: 200 }),
    );
    const c = createApiClient({ baseUrl: "https://test/api/v1", fetch });
    expect(await registerMyDevice(c, { fcmToken: "fcm-secret", platform: "android" })).toEqual(
      device,
    );
    expect(fetch.mock.calls[0]?.[0]).toBe("https://test/api/v1/me/devices");
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      fcmToken: "fcm-secret",
      platform: "android",
    });
    await expect(registerMyDevice(c, { fcmToken: "", platform: "android" })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("DELETE id dan respons 204 didukung tanpa parsing JSON", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
    const c = createApiClient({ baseUrl: "https://test/api/v1", fetch });
    await expect(unregisterMyDevice(c, ID)).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]?.[0]).toBe(`https://test/api/v1/me/devices/${ID}`);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});
