import { describe, expect, it } from "vitest";

import { apiBaseUrl } from "../src/config";

describe("apiBaseUrl", () => {
  it("dev tanpa nilai → API lokal lewat emulator", () => {
    expect(apiBaseUrl(undefined, true)).toBe("http://10.0.2.2:3000/api/v1");
  });

  it("membuang spasi dan garis miring penutup", () => {
    expect(apiBaseUrl(" https://api.contoh.id/api/v1/ ", false)).toBe(
      "https://api.contoh.id/api/v1",
    );
  });

  it("dev boleh HTTP (mis. IP LAN mesin pengembang)", () => {
    expect(apiBaseUrl("http://192.168.1.5:3000/api/v1", true)).toBe(
      "http://192.168.1.5:3000/api/v1",
    );
  });

  it.each([
    ["kosong", undefined],
    ["HTTP", "http://api.contoh.id/api/v1"],
  ])("non-dev menolak URL %s", (_, nilai) => {
    expect(() => apiBaseUrl(nilai, false)).toThrow(/EXPO_PUBLIC_API_URL/);
  });
});
