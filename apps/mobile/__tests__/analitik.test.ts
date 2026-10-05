import { describe, expect, it, vi } from "vitest";

import { createAnalitik } from "../src/analitik/klien";
import { pathAnalitik } from "../src/analitik/rute";

const ID = "018f4c1e-0000-7000-8000-00000000aaaa";
function buat(nilai = new Map<string, string>()) {
  const storage = {
    getItem: vi.fn(async (k: string) => nilai.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      nilai.set(k, v);
    }),
  };
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("{}"));
  const deps = { storage, fetch, url: "https://stats.example.test", websiteId: ID };
  return { nilai, deps, a: createAnalitik(deps) };
}
describe("funnel mobile no-PII", () => {
  it("identitas route dibuang; nama layar asing tidak menjadi path bebas", () => {
    expect(pathAnalitik("LamaranDetail")).toBe("/lamaran/:id");
    expect(pathAnalitik("Nama Pribadi")).toBe("/");
  });
  it("normalisasi id/query/hash sebelum transport Umami, tanpa kredensial/token", async () => {
    const { a, deps } = buat();
    await a.mulai();
    a.pageview(`/lamaran/${ID}?token=secret#nama`);
    a.track("lamar");
    await vi.waitFor(() => expect(deps.fetch).toHaveBeenCalledTimes(2));
    const req = deps.fetch.mock.calls[1]?.[1];
    const body = JSON.parse(String(req?.body)) as { payload: Record<string, unknown> };
    expect(body.payload).toEqual({
      website: ID,
      hostname: "android.nawasena.app",
      language: "id",
      screen: "",
      url: "/lamaran/:id",
      name: "lamar",
    });
    expect(req?.credentials).toBe("omit");
    expect(req?.headers).toEqual({ "content-type": "application/json" });
  });
  it("data disclosure/PII dari pemanggil salah ditolak kontrak runtime", async () => {
    const { a, deps } = buat();
    await a.mulai();
    // @ts-expect-error simulasi pemanggil JS yang melanggar kontrak
    a.track("lamar", { discloseDisability: "true", email: "rina@example.test" });
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("privacy preference dibaca sebelum event pertama; opt-out bertahan restart", async () => {
    const { a, nilai, deps } = buat();
    a.track("lamar");
    expect(deps.fetch).not.toHaveBeenCalled();
    await a.mulai();
    await a.aturDimatikan(true);
    a.track("lamar");
    const b = buat(nilai);
    await b.a.mulai();
    b.a.track("lamar");
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(b.deps.fetch).not.toHaveBeenCalled();
  });
  it("tanpa konfigurasi HTTPS/website id atau storage gagal: no-op", async () => {
    const { deps } = buat();
    const a = createAnalitik({ ...deps, url: "http://stats.example.test" });
    await a.mulai();
    a.track("lamar");
    expect(deps.fetch).not.toHaveBeenCalled();
    const b = createAnalitik({ ...deps, websiteId: undefined });
    await b.mulai();
    b.track("lamar");
    deps.storage.getItem.mockRejectedValue(new Error("storage"));
    const c = createAnalitik(deps);
    await c.mulai();
    c.track("lamar");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("wawancara sekali per subjek, termasuk paralel dan restart", async () => {
    const { a, nilai, deps } = buat();
    await a.mulai();
    await Promise.all([
      a.sekaliSaja("wawancara.abc", () => a.track("wawancara")),
      a.sekaliSaja("wawancara.abc", () => a.track("wawancara")),
    ]);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    const b = buat(nilai);
    await b.a.mulai();
    await b.a.sekaliSaja("wawancara.abc", () => b.a.track("wawancara"));
    expect(b.deps.fetch).not.toHaveBeenCalled();
  });
  it("jaringan analytics gagal ditelan", async () => {
    const { a, deps } = buat();
    await a.mulai();
    deps.fetch.mockRejectedValue(new Error("offline"));
    expect(() => a.track("hired_confirmed")).not.toThrow();
    await vi.waitFor(() => expect(deps.fetch).toHaveBeenCalledTimes(1));
  });
});
