// Analytics privacy-first (PR-082) — util web.
//   - tiga pintu mati: tanpa website id, DNT/GPC, opt-out pengguna;
//   - payload ke Umami: path ternormal, TANPA title/referrer, event lewat kontrak;
//   - fire-and-forget: server mati tidak pernah melempar ke pemanggil.
// Kontrak no-PII itu sendiri diuji di `packages/schemas/__tests__/analytics.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analitikAktif,
  aturAnalitikDimatikan,
  aturKonfigurasiAnalitik,
  KUNCI_OPT_OUT,
  pelacakanDitolakPeramban,
  sekaliSaja,
} from "../src/shared/analitik.js";
import { badanUmami, kirimKeUmami, siapkanPayload } from "../src/shared/analitik-kirim.js";

const KONFIG = { websiteId: "00000000-0000-4000-8000-000000000001", dasarUrl: "/analitik" };
const UUID = "01912345-89ab-7def-8123-4567890aaa40";

function aturDnt(nilai: string | null, gpc = false): void {
  Object.defineProperty(navigator, "doNotTrack", { value: nilai, configurable: true });
  Object.defineProperty(navigator, "globalPrivacyControl", { value: gpc, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  aturDnt(null);
  aturKonfigurasiAnalitik(KONFIG);
});

afterEach(() => {
  aturKonfigurasiAnalitik({ websiteId: undefined, dasarUrl: "/analitik" });
});

describe("pintu mati", () => {
  it("aktif hanya bila ada website id, peramban tidak menolak, dan pengguna tidak opt-out", () => {
    expect(analitikAktif()).toBe(true);

    aturKonfigurasiAnalitik({ websiteId: undefined, dasarUrl: "/analitik" });
    expect(analitikAktif()).toBe(false);
    aturKonfigurasiAnalitik(KONFIG);

    aturDnt("1");
    expect(pelacakanDitolakPeramban()).toBe(true);
    expect(analitikAktif()).toBe(false);
    aturDnt(null, true);
    expect(analitikAktif()).toBe(false);
    aturDnt(null);

    aturAnalitikDimatikan(true);
    expect(localStorage.getItem(KUNCI_OPT_OUT)).toBe("1");
    expect(analitikAktif()).toBe(false);
    aturAnalitikDimatikan(false);
    expect(analitikAktif()).toBe(true);
  });

  it("sekaliSaja: kerja dijalankan sekali per kunci", () => {
    const kerja = vi.fn();
    sekaliSaja("wawancara.a", kerja);
    sekaliSaja("wawancara.a", kerja);
    sekaliSaja("wawancara.b", kerja);
    expect(kerja).toHaveBeenCalledTimes(2);
  });
});

describe("payload ke Umami", () => {
  it("pageview: path ternormal, tanpa title/referrer", () => {
    const p = siapkanPayload({ type: "pageview", pathMentah: `/lamaran/${UUID}?x=1` });
    expect(p).toEqual({ type: "pageview", path: "/lamaran/:id" });
    const badan = badanUmami(p!, KONFIG.websiteId);
    expect(badan.type).toBe("event");
    expect(badan.payload).toMatchObject({ website: KONFIG.websiteId, url: "/lamaran/:id" });
    expect(badan.payload).not.toHaveProperty("title");
    expect(badan.payload).not.toHaveProperty("referrer");
    expect(badan.payload).not.toHaveProperty("name");
  });

  it("event: nama + data kontrak; data liar → TIDAK dikirim", () => {
    const p = siapkanPayload({
      type: "event",
      pathMentah: "/cv",
      name: "cv_dibuat",
      data: { via: "ai" },
    });
    expect(badanUmami(p!, KONFIG.websiteId).payload).toMatchObject({
      name: "cv_dibuat",
      data: { via: "ai" },
    });
    expect(
      siapkanPayload({ type: "event", pathMentah: "/", name: "lamar", data: { userId: UUID } }),
    ).toBeNull();
  });

  it("POST first-party ke /analitik/api/send, keepalive, tanpa cookie", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await kirimKeUmami({ type: "event", pathMentah: "/", name: "lamar" }, KONFIG, fetch);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/analitik/api/send");
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });
  });

  it("server analytics mati → tidak melempar (fire-and-forget)", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      kirimKeUmami({ type: "pageview", pathMentah: "/" }, KONFIG, fetch),
    ).resolves.toBeUndefined();
  });

  it("payload tak sah tidak pernah memanggil fetch", async () => {
    const fetch = vi.fn();
    await kirimKeUmami(
      { type: "event", pathMentah: "/", name: "klik_bebas" as never },
      KONFIG,
      fetch,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
