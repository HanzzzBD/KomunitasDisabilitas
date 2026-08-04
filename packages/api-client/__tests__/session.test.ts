// Hook refresh api-client (PR-018b).
// AC: "api-client 401→refresh→retry bekerja end-to-end (mock)".
import { describe, it, expect, vi } from "vitest";
import { createApiClient, createSessionRefresher } from "../src/index.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const sesiBaru = (suffix = "1") =>
  jsonResponse(200, { data: { accessToken: `access-${suffix}`, expiresIn: 900 } });

const sesiHabis = () =>
  jsonResponse(401, { code: "SESI_TIDAK_VALID", message: "Sesi Anda sudah berakhir" });

/** Rakit klien + refresher yang saling terhubung, seperti di aplikasi nyata. */
function rakit(fetch: ReturnType<typeof vi.fn>) {
  let accessToken: string | null = "access-lama";
  const disimpan: string[] = [];
  const berakhir = vi.fn();

  const client = createApiClient({
    baseUrl: "https://x/api/v1",
    fetch: fetch as unknown as typeof globalThis.fetch,
    getAccessToken: () => accessToken,
    refresh: () => refresher(),
  });
  const refresher = createSessionRefresher({
    client,
    onAccessToken: (token) => {
      accessToken = token;
      disimpan.push(token);
    },
    onSessionEnded: berakhir,
  });

  return { client, disimpan, berakhir, tokenSekarang: () => accessToken };
}

describe("401 → refresh → retry", () => {
  it("permintaan yang 401 diulang SEKALI dengan access token baru", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "TIDAK_TERAUTENTIKASI", message: "x" }))
      .mockResolvedValueOnce(sesiBaru())
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

    const { client, disimpan } = rakit(fetch);
    const hasil = await client.request<{ data: { ok: boolean } }>("/me");

    expect(hasil).toEqual({ data: { ok: true } });
    expect(disimpan).toEqual(["access-1"]);

    // Urutan panggilan: /me (401) → /auth/refresh → /me (ulang).
    const jalur = fetch.mock.calls.map((c) => String(c[0]));
    expect(jalur).toEqual([
      "https://x/api/v1/me",
      "https://x/api/v1/auth/refresh",
      "https://x/api/v1/me",
    ]);
  });

  it("percobaan ulang memakai token BARU, bukan token lama", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "TIDAK_TERAUTENTIKASI", message: "x" }))
      .mockResolvedValueOnce(sesiBaru())
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    const { client } = rakit(fetch);
    await client.request("/me");

    const headerUlang = (fetch.mock.calls[2]?.[1] as { headers: Record<string, string> }).headers;
    expect(headerUlang.authorization).toBe("Bearer access-1");
  });

  it("refresh gagal → 401 diteruskan ke pemanggil + onSessionEnded dipanggil", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "TIDAK_TERAUTENTIKASI", message: "x" }))
      .mockResolvedValueOnce(sesiHabis());

    const { client, berakhir } = rakit(fetch);
    const err = await client.request("/me").catch((e: unknown) => e);

    expect((err as { status: number }).status).toBe(401);
    expect(berakhir).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2); // tidak ada retry setelah refresh gagal
  });

  it("401 KEDUA tidak memicu refresh lagi (retry hanya sekali)", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "TIDAK_TERAUTENTIKASI", message: "x" }))
      .mockResolvedValueOnce(sesiBaru())
      .mockResolvedValueOnce(jsonResponse(401, { code: "TIDAK_TERAUTENTIKASI", message: "x" }));

    const { client } = rakit(fetch);
    await client.request("/me").catch(() => undefined);

    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("single-flight (refresh ROTATING)", () => {
  it("tiga permintaan 401 bersamaan hanya memicu SATU panggilan /auth/refresh", async () => {
    // Ini bukan optimasi: refresh token dirotasi tiap pemakaian, jadi tiga
    // panggilan paralel berarti dua di antaranya membawa token yang sudah
    // dicabut — server membacanya sebagai reuse dan mencabut seluruh sesi.
    const fetch = vi.fn((url: string) => {
      if (String(url).endsWith("/auth/refresh")) return Promise.resolve(sesiBaru());
      // Semua permintaan pertama 401; setelah token tersimpan, sukses.
      return Promise.resolve(
        tokenTersimpan
          ? jsonResponse(200, { data: { ok: true } })
          : jsonResponse(401, { code: "TIDAK_TERAUTENTIKASI", message: "x" }),
      );
    });
    let tokenTersimpan = false;

    const client = createApiClient({
      baseUrl: "https://x/api/v1",
      fetch: fetch as unknown as typeof globalThis.fetch,
      getAccessToken: () => "lama",
      refresh: () => refresher(),
    });
    const refresher = createSessionRefresher({
      client,
      onAccessToken: () => {
        tokenTersimpan = true;
      },
    });

    await Promise.all([client.request("/a"), client.request("/b"), client.request("/c")]);

    const panggilanRefresh = fetch.mock.calls.filter((c) =>
      String(c[0]).endsWith("/auth/refresh"),
    );
    expect(panggilanRefresh).toHaveLength(1);
  });

  it("refresh berikutnya (setelah yang pertama selesai) tetap boleh jalan", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "X", message: "x" }))
      .mockResolvedValueOnce(sesiBaru("1"))
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }))
      .mockResolvedValueOnce(jsonResponse(401, { code: "X", message: "x" }))
      .mockResolvedValueOnce(sesiBaru("2"))
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    const { client, disimpan } = rakit(fetch);
    await client.request("/a");
    await client.request("/b");

    // Dua siklus terpisah → dua refresh. Single-flight hanya menggabungkan
    // yang BERSAMAAN, bukan mematikan refresh selamanya.
    expect(disimpan).toEqual(["access-1", "access-2"]);
  });
});

describe("mobile (refresh token di body)", () => {
  it("mengirim refreshToken tersimpan dan menyimpan yang baru", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "X", message: "x" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { accessToken: "access-baru", expiresIn: 900, refreshToken: "refresh-baru" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    const refreshTersimpan: string[] = [];
    const client = createApiClient({
      baseUrl: "https://x/api/v1",
      fetch: fetch as unknown as typeof globalThis.fetch,
      getAccessToken: () => "lama",
      refresh: () => refresher(),
    });
    const refresher = createSessionRefresher({
      client,
      onAccessToken: () => {},
      getRefreshToken: () => "refresh-lama",
      onRefreshToken: (t) => {
        refreshTersimpan.push(t);
      },
    });

    await client.request("/me");

    const bodyRefresh = JSON.parse(
      String((fetch.mock.calls[1]?.[1] as { body: string }).body),
    ) as { refreshToken: string };
    expect(bodyRefresh.refreshToken).toBe("refresh-lama");
    expect(refreshTersimpan).toEqual(["refresh-baru"]);
  });

  it("web (tanpa getRefreshToken) mengirim body kosong — tokennya di cookie", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "X", message: "x" }))
      .mockResolvedValueOnce(sesiBaru())
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    const { client } = rakit(fetch);
    await client.request("/me");

    const bodyRefresh = String((fetch.mock.calls[1]?.[1] as { body: string }).body);
    expect(JSON.parse(bodyRefresh)).toEqual({});
  });
});
