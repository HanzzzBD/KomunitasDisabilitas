// Endpoint hapus akun (PR-033c-1).
//
// Yang paling berharga di berkas ini adalah test terakhir: skema menuntut TEPAT
// satu cara pembuktian, dan validasinya berjalan DI KLIEN sebelum satu byte pun
// dikirim. Tanpa itu, bug klien yang mengirim dua bukti (atau nol) baru
// ketahuan setelah satu perjalanan ke server yang sudah pasti gagal — dan
// pesannya di sana tidak menyebut mana yang salah.
import { describe, expect, it, vi } from "vitest";
import { createApiClient, deleteAccount, type ApiError } from "../src/index.js";

const PKCE = {
  code: "4/0AY0e-g7".padEnd(24, "x"),
  codeVerifier: "a".repeat(64),
  redirectUri: "http://localhost:5173/masuk/google",
};

function kosong(status: number): Response {
  // 204 tanpa body — persis yang dikirim server.
  return new Response(null, { status });
}

describe("deleteAccount", () => {
  it("mengirim DELETE ke /auth/account beserta kode OTP", async () => {
    const fetch = vi.fn().mockResolvedValue(kosong(204));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await deleteAccount(client, { otpCode: "123456" });

    expect(fetch).toHaveBeenCalledWith(
      "https://x/api/v1/auth/account",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ otpCode: "123456" }) }),
    );
  });

  it("204 tanpa body TIDAK dianggap kegagalan", async () => {
    // `response.json()` menolak pada body kosong. Klien yang tidak menanganinya
    // akan melaporkan penghapusan yang BERHASIL sebagai gagal — dan pengguna
    // mencobanya lagi atas akun yang sudah tidak ada.
    const fetch = vi.fn().mockResolvedValue(kosong(204));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await expect(deleteAccount(client, { otpCode: "123456" })).resolves.toBeUndefined();
  });

  it("menerima jalur Google", async () => {
    const fetch = vi.fn().mockResolvedValue(kosong(204));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await deleteAccount(client, { google: PKCE });

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ body: JSON.stringify({ google: PKCE }) });
  });

  it("kode salah diteruskan sebagai ApiError, bukan ditelan", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "KODE_OTP_SALAH", message: "Kode salah" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await deleteAccount(client, { otpCode: "000000" }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err.code).toBe("KODE_OTP_SALAH");
    expect(err.status).toBe(401);
  });

  it("DUA cara pembuktian ditolak DI KLIEN — tidak ada permintaan sama sekali", async () => {
    // Permintaan yang membawa dua bukti berarti klien tidak tahu yang mana yang
    // sedang ia pakai; menebak untuknya menyembunyikan bug itu.
    const fetch = vi.fn();
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await expect(deleteAccount(client, { otpCode: "123456", google: PKCE })).rejects.toThrow();
    expect(fetch, "permintaan yang pasti ditolak tetap dikirim").not.toHaveBeenCalled();
  });

  it("TANPA cara pembuktian juga ditolak di klien", async () => {
    const fetch = vi.fn();
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await expect(deleteAccount(client, {})).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
