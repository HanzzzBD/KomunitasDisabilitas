// Endpoint Sign in with Google Android (PR-090).
import { describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  googleMobileAuth,
  requestGoogleMobileNonce,
  type ApiError,
} from "../src/index.js";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SESI = {
  userId: "01912345-89ab-7def-8123-000000000001",
  isNewUser: false,
  accessToken: "at",
  expiresIn: 900,
  refreshToken: "rt",
};

describe("requestGoogleMobileNonce", () => {
  it("POST tanpa body ke /auth/google/mobile/nonce dan mem-parse jawabannya", async () => {
    const nonce = "n".repeat(43);
    const fetch = vi.fn().mockResolvedValue(json(200, { data: { nonce, expiresIn: 300 } }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const { data } = await requestGoogleMobileNonce(client);

    expect(data).toEqual({ nonce, expiresIn: 300 });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/auth/google/mobile/nonce");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: undefined });
  });

  it("nonce yang salah bentuk ditolak sebagai respons tidak dikenal", async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { data: { nonce: "pendek", expiresIn: 1 } }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await expect(requestGoogleMobileNonce(client)).rejects.toMatchObject({ status: 200 });
  });
});

describe("googleMobileAuth", () => {
  it("mengirim idToken dan mengembalikan pasangan token beserta refresh", async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { data: SESI }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const { data } = await googleMobileAuth(client, { idToken: "eyJ.isi.ttd" });

    expect(data.refreshToken).toBe("rt");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ idToken: "eyJ.isi.ttd" }),
    });
  });

  it("idToken kosong ditolak di klien, tanpa permintaan jaringan", async () => {
    const fetch = vi.fn();
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await expect(googleMobileAuth(client, { idToken: "  " })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("401 diteruskan sebagai ApiError dengan kodenya", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json(401, { code: "TOKEN_GOOGLE_TIDAK_VALID", message: "Tidak sah" }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await googleMobileAuth(client, { idToken: "x" }).catch((e: unknown) => e)) as
      | ApiError
      | undefined;
    expect(err?.code).toBe("TOKEN_GOOGLE_TIDAK_VALID");
  });
});
