import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import type * as Fs from "node:fs";
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof Fs>()),
  existsSync: vi.fn(),
}));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("EAS_BUILD", "false");
  vi.stubEnv("GOOGLE_SERVICES_JSON", "");
  vi.mocked(existsSync).mockReturnValue(false);
});
afterEach(() => vi.unstubAllEnvs());
describe("konfigurasi Firebase Android", () => {
  it("berkas lokal menyalakan push tanpa variabel EAS", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const { default: config } = await import("../app.config.js");
    expect(config.android?.googleServicesFile).toBe("./google-services.json");
    expect(config.extra?.pushConfigure).toBe(true);
  });
  it("berkas EAS mengambil prioritas", async () => {
    vi.stubEnv("GOOGLE_SERVICES_JSON", "/eas/firebase.json");
    const { default: config } = await import("../app.config.js");
    expect(config.android?.googleServicesFile).toBe("/eas/firebase.json");
    expect(config.extra?.pushConfigure).toBe(true);
  });
  it("tanpa berkas tetap menyatakan push belum tersedia", async () => {
    const { default: config } = await import("../app.config.js");
    expect(config.android?.googleServicesFile).toBeUndefined();
    expect(config.extra?.pushConfigure).toBe(false);
  });
});
