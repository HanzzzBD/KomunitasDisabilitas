import { describe, it, expect, vi } from "vitest";
import { createApiClient, ApiError, requestOtp } from "../src/index.js";

// Mock fetch via injeksi — tanpa DOM/msw. Suite ini jalan di environment node
// polos: bukti paket bebas dependensi DOM (AC "jalan di RN").

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createApiClient — envelope & error mapping", () => {
  it("memetakan envelope error API ke ApiError {code, message, hint}", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        code: "VALIDATION_ERROR",
        message: "Input tidak valid",
        hint: "Periksa format nomor HP Anda",
      }),
    );
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = await client.request("/apa-saja").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe("VALIDATION_ERROR");
    expect(apiErr.message).toBe("Input tidak valid");
    expect(apiErr.hint).toBe("Periksa format nomor HP Anda");
    expect(apiErr.status).toBe(400);
  });

  it("body error tak dikenal (mis. HTML gateway) → RESPONS_TIDAK_DIKENAL", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const client = createApiClient({ baseUrl: "https://x", fetch });

    const err = (await client.request("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("RESPONS_TIDAK_DIKENAL");
    expect(err.status).toBe(502);
  });

  it("fetch reject (server tak terjangkau) → JARINGAN_GAGAL status 0", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const client = createApiClient({ baseUrl: "https://x", fetch });

    const err = (await client.request("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("JARINGAN_GAGAL");
    expect(err.status).toBe(0);
    expect(err.message).toBe("Tidak dapat terhubung ke server");
  });
});

describe("createApiClient — 401 → refresh → retry", () => {
  it("401 lalu refresh true → retry sekali → sukses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { code: "TOKEN_KEDALUWARSA", message: "Sesi berakhir" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
    const refresh = vi.fn().mockResolvedValue(true);
    const client = createApiClient({ baseUrl: "https://x", fetch, refresh });

    const result = await client.request<{ data: { ok: boolean } }>("/aman");
    expect(result.data.ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("401 kedua setelah retry → ApiError, TIDAK loop refresh", async () => {
    const envelope401 = { code: "TOKEN_KEDALUWARSA", message: "Sesi berakhir" };
    const fetch = vi.fn().mockResolvedValue(jsonResponse(401, envelope401));
    const refresh = vi.fn().mockResolvedValue(true);
    const client = createApiClient({ baseUrl: "https://x", fetch, refresh });

    const err = (await client.request("/aman").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("TOKEN_KEDALUWARSA");
    expect(refresh).toHaveBeenCalledTimes(1); // sekali, tidak berulang
    expect(fetch).toHaveBeenCalledTimes(2); // asli + 1 retry
  });

  it("refresh default (stub PR-018) menolak → 401 langsung jadi ApiError", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: "X", message: "Sesi berakhir" }));
    const client = createApiClient({ baseUrl: "https://x", fetch });

    const err = (await client.request("/aman").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1); // tanpa retry
  });

  it("token retry memakai getAccessToken terbaru; token tidak bocor ke error", async () => {
    const tokens = ["token-lama", "token-baru"];
    let call = 0;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "X", message: "Sesi berakhir" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: null }));
    const client = createApiClient({
      baseUrl: "https://x",
      fetch,
      getAccessToken: () => tokens[call++] ?? null,
      refresh: () => true,
    });

    await client.request("/aman");
    const firstHeaders = (fetch.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    const retryHeaders = (fetch.mock.calls[1]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(firstHeaders.authorization).toBe("Bearer token-lama");
    expect(retryHeaders.authorization).toBe("Bearer token-baru");

    // Token tidak pernah menyentuh objek error (uji serialisasi ApiError).
    const fetchErr = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { code: "S", message: "Terjadi kesalahan" }));
    const clientErr = createApiClient({
      baseUrl: "https://x",
      fetch: fetchErr,
      getAccessToken: () => "RAHASIA",
    });
    const err = (await clientErr.request("/x").catch((e: unknown) => e)) as ApiError;
    expect(JSON.stringify({ ...err, message: err.message, stack: err.stack })).not.toContain(
      "RAHASIA",
    );
  });
});

describe("endpoint contoh requestOtp (skema PR-004)", () => {
  it("validasi body sebelum kirim: nomor non-+62 gagal TANPA memanggil fetch", async () => {
    const fetch = vi.fn();
    const client = createApiClient({ baseUrl: "https://x", fetch });

    await expect(requestOtp(client, { phone: "0812" })).rejects.toThrow(/\+62/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sukses: POST path benar + response tervalidasi skema", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(202, { data: { retryAfterSeconds: 60 } }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const res = await requestOtp(client, { phone: "+6281234567890" });
    expect(res.data.retryAfterSeconds).toBe(60);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/auth/otp/request");
    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
  });

  it("response menyimpang dari skema (drift runtime) → RESPONS_TIDAK_DIKENAL", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(202, { data: { salah: "bentuk" } }));
    const client = createApiClient({ baseUrl: "https://x", fetch });

    const err = (await requestOtp(client, { phone: "+6281234567890" }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("RESPONS_TIDAK_DIKENAL");
  });
});
