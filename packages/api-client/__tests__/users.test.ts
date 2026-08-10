// Endpoint `/me` (PR-033a) — dikonsumsi halaman pengaturan.
//
// Yang diuji di sini BUKAN "fetch dipanggil", melainkan dua janji yang dipegang
// lapisan endpoint: alamat & metode yang benar, dan penolakan atas jawaban yang
// tidak sesuai kontrak. Yang kedua itulah nilainya — tanpa parse, kontrak yang
// bergeser di server berubah menjadi `undefined` yang menyebar sampai ke layar.
import { describe, expect, it, vi } from "vitest";
import { createApiClient, exportMe, getMe, usersKeys, ApiError } from "../src/index.js";
import * as apiClient from "../src/index.js";

const EKSPOR = {
  formatVersion: 1,
  exportedAt: "2026-01-15T20:00:00.000Z",
  account: {
    id: "01912345-89ab-7def-8123-456789abcdef",
    fullName: "Rina Pratiwi",
    email: "rina@contoh.id",
    emailVerified: true,
    phone: "+6281234567890",
    role: "seeker",
    createdAt: "2026-01-15T20:00:00.000Z",
    authMethods: ["otp"],
  },
};

const PROFIL = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Rina Pratiwi",
  email: "rina@contoh.id",
  phone: "+6281234567890",
  role: "seeker",
  createdAt: "2026-01-15T20:00:00.000Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getMe", () => {
  it("memanggil GET /me dan mengembalikan profil yang terparse", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PROFIL }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const hasil = await getMe(client);

    expect(fetch).toHaveBeenCalledWith(
      "https://x/api/v1/me",
      expect.objectContaining({ method: "GET" }),
    );
    expect(hasil.data.fullName).toBe("Rina Pratiwi");
  });

  it("tidak mengirim body sama sekali", async () => {
    // Endpoint ini sengaja tidak punya saluran input: identitasnya datang dari
    // sesi, dan tidak ada cara menyebut pengguna lain. Body yang tak sengaja
    // ikut terkirim akan membuat kontraknya tampak lebih longgar daripada
    // sebenarnya bagi siapa pun yang membaca lalu lintasnya.
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PROFIL }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await getMe(client);

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ body: undefined });
  });

  it("jawaban yang menyimpang dari kontrak DITOLAK, bukan diteruskan", async () => {
    // `createdAt` hilang. Tanpa parse, halaman pengaturan menerima `undefined`
    // lalu menampilkan "Invalid Date" — cacat yang muncul jauh dari sebabnya.
    const { createdAt: _buang, ...tanpaTanggal } = PROFIL;
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: tanpaTanggal }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await getMe(client).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("RESPONS_TIDAK_DIKENAL");
  });

  it("401 diteruskan sebagai ApiError, bukan ditelan", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: "SESI_TIDAK_VALID", message: "Sesi berakhir" }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await getMe(client).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("SESI_TIDAK_VALID");
    expect(err.status).toBe(401);
  });
});

describe("exportMe", () => {
  it("memanggil GET /me/export dan mengembalikan berkas yang terparse", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: EKSPOR }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const hasil = await exportMe(client);

    expect(fetch).toHaveBeenCalledWith(
      "https://x/api/v1/me/export",
      expect.objectContaining({ method: "GET" }),
    );
    expect(hasil.data.formatVersion).toBe(1);
    expect(hasil.data.account.authMethods).toEqual(["otp"]);
  });

  it("berkas yang menyimpang dari kontrak DITOLAK", async () => {
    // Berkas ini adalah janji jangka panjang kepada pengguna: yang diunduh hari
    // ini harus tetap terbaca alat yang sama tahun depan. Bentuk yang bergeser
    // harus gagal di sini, bukan mendarat di folder unduhan seseorang.
    const { formatVersion: _buang, ...tanpaVersi } = EKSPOR;
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: tanpaVersi }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await exportMe(client).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("RESPONS_TIDAK_DIKENAL");
  });

  it("kuota habis (429) diteruskan lengkap dengan sarannya", async () => {
    // `hint` adalah bagian yang menjawab "lalu saya harus apa". Ia sering
    // hilang di klien yang hanya membaca `message`.
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(429, {
        code: "TERLALU_BANYAK_PERMINTAAN",
        message: "Anda sudah beberapa kali mengunduh data hari ini",
        hint: "Coba lagi besok, atau simpan berkas yang sudah Anda unduh",
      }),
    );
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await exportMe(client).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("TERLALU_BANYAK_PERMINTAAN");
    expect(err.status).toBe(429);
    expect(err.hint).toContain("besok");
  });

  it("TIDAK punya query key — ekspor bukan pembacaan yang boleh diulang cache", () => {
    // Tiap panggilan memakan kuota (3×/24 jam) dan tercatat di audit. Query key
    // adalah undangan memakainya lewat `useQuery`, yang akan berjalan sendiri
    // saat komponen dipasang dan menghabiskan jatah pengguna tanpa ia menekan
    // apa pun. Ketiadaannya di sini yang membuat jalan itu tidak tersedia.
    expect(Object.keys(usersKeys)).toEqual(["me"]);
    expect(Object.keys(apiClient)).not.toContain("exportKeys");
  });
});

describe("usersKeys", () => {
  it("key /me tidak membawa params", () => {
    // Params (mis. userId) akan mengundang cache berisi data pengguna berbeda
    // dalam satu sesi peramban — dan cache seperti itu menampilkan data orang
    // lain setelah berganti akun.
    expect(usersKeys.me()).toEqual(["users-me"]);
  });

  it("stabil antar pemanggilan, sehingga cache tidak pecah", () => {
    expect(JSON.stringify(usersKeys.me())).toBe(JSON.stringify(usersKeys.me()));
  });
});
