// Endpoint `/me/accessibility` (PR-035) — pemakai pertama kontrak PR-034.
//
// YANG DIUJI DI SINI bukan "fetch dipanggil", melainkan tiga janji lapisan
// endpoint: alamat & metode yang benar, penolakan atas jawaban yang menyimpang
// dari kontrak, dan penolakan atas field asing SEBELUM permintaannya berangkat.
//
// Yang kedua paling mudah salah dan paling mahal: controller PR-034 membungkus
// jawabannya `{ data }`, sehingga skema yang memarse preferensi telanjang akan
// menolak SETIAP jawaban yang benar — dan hanya di produksi, sebab fixture yang
// ditulis tangan cenderung ikut salah dengan cara yang sama.
import { describe, expect, it, vi } from "vitest";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/schemas";
import {
  accessibilityKeys,
  createApiClient,
  getAccessibility,
  updateAccessibility,
  ApiError,
} from "../src/index.js";

const PREFERENSI = {
  textScale: 150,
  highContrast: true,
  reduceMotion: false,
  simpleLanguage: true,
  prefersSignLanguage: false,
  largeTouchTargets: true,
  screenReaderHint: false,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getAccessibility", () => {
  it("memanggil GET /me/accessibility dan MEMBUKA amplop `{ data }`", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PREFERENSI }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const hasil = await getAccessibility(client);

    expect(fetch).toHaveBeenCalledWith(
      "https://x/api/v1/me/accessibility",
      expect.objectContaining({ method: "GET" }),
    );
    // Bukan `hasil.data.textScale`: pemanggilnya menaruh hasil ini langsung ke
    // store preferensi, jadi amplopnya dibuka di sini sekali untuk selamanya.
    expect(hasil.textScale).toBe(150);
    expect(hasil.simpleLanguage).toBe(true);
  });

  it("tidak mengirim body sama sekali", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PREFERENSI }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await getAccessibility(client);

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ body: undefined });
  });

  it("jawaban yang kehilangan satu field DITOLAK, bukan diteruskan", async () => {
    // `screenReaderHint` adalah field yang paling mungkin hilang: SDD §4.3
    // menyebut enam preferensi sementara tabelnya punya tujuh (lihat catatan
    // `packages/schemas/src/accessibility.ts`). Tanpa parse, layar preferensi
    // menerima `undefined` dan menampilkan kendali yang tampak "mati".
    const { screenReaderHint: _buang, ...kurang } = PREFERENSI;
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: kurang }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await getAccessibility(client).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("RESPONS_TIDAK_DIKENAL");
  });

  it("preferensi TELANJANG (tanpa amplop) juga ditolak", async () => {
    // Arah sebaliknya, dan inilah yang membuktikan pembungkusnya bekerja: skema
    // yang menerima KEDUA bentuk tidak menjaga apa pun.
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, PREFERENSI));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await getAccessibility(client).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("RESPONS_TIDAK_DIKENAL");
  });

  it("401 diteruskan sebagai ApiError, bukan ditelan", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: "SESI_TIDAK_VALID", message: "Sesi berakhir" }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await getAccessibility(client).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("SESI_TIDAK_VALID");
    expect(err.status).toBe(401);
  });
});

describe("updateAccessibility", () => {
  it("memanggil PUT /me/accessibility dengan body yang dikirimkan", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PREFERENSI }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const hasil = await updateAccessibility(client, PREFERENSI);

    const [alamat, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(alamat).toBe("https://x/api/v1/me/accessibility");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual(PREFERENSI);
    expect(hasil.textScale).toBe(150);
  });

  it("perubahan SEBAGIAN tetap sah — skemanya `.partial()`", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { data: { ...ACCESSIBILITY_DEFAULTS, highContrast: true } }),
      );
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await updateAccessibility(client, { highContrast: true });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ highContrast: true });
  });

  it("field asing DITOLAK SEBELUM permintaan berangkat", async () => {
    // `.strict()` di skema, bukan pembuangan diam-diam di server. Yang penting
    // di sini adalah `fetch` tidak pernah terpanggil: preferensi yang salah
    // tulis lalu dibuang diam-diam akan tampak "tersimpan" bagi pengguna
    // sementara layarnya tidak berubah.
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PREFERENSI }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await expect(
      updateAccessibility(client, { highContrast: true, ragamDisabilitas: ["tuli"] } as never),
    ).rejects.toThrow();
    expect(
      fetch,
      "permintaan berangkat membawa field yang bukan bagian kontrak",
    ).not.toHaveBeenCalled();
  });

  it("nilai di luar batas ditolak di klien — 100..200 (WCAG 2.2 §1.4.4)", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PREFERENSI }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    await expect(updateAccessibility(client, { textScale: 250 })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("jawaban yang menyimpang dari kontrak DITOLAK", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: { textScale: 150 } }));
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });

    const err = (await updateAccessibility(client, { textScale: 150 }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("RESPONS_TIDAK_DIKENAL");
  });
});

describe("accessibilityKeys", () => {
  it("stabil antar pemanggilan untuk sub yang sama, sehingga cache tidak pecah", () => {
    expect(JSON.stringify(accessibilityKeys.me("u-1"))).toBe(
      JSON.stringify(accessibilityKeys.me("u-1")),
    );
  });

  // INI PENJAGA ISOLASI LINTAS-PENGGUNA, bukan uji bentuk.
  //
  // Versi sebelumnya justru menjepit kebalikannya — `me()` tanpa params — dengan
  // alasan tertulis "params akan mengundang cache berisi preferensi pengguna
  // berbeda dalam satu sesi peramban". Alasan itu terbalik dari akibatnya: satu
  // key tanpa params dipakai BERSAMA oleh setiap pengguna yang pernah masuk di
  // tab yang sama, dan cache TanStack hidup selama dokumennya, bukan selama
  // sesinya. Justru bentuk itulah yang menyimpan preferensi orang lain.
  it("pengguna berbeda TIDAK PERNAH berbagi entri cache", () => {
    expect(JSON.stringify(accessibilityKeys.me("u-1"))).not.toBe(
      JSON.stringify(accessibilityKeys.me("u-2")),
    );
  });

  it("sesi tanpa identitas punya laci sendiri, tidak menetes ke pengguna mana pun", () => {
    const anonim = JSON.stringify(accessibilityKeys.me(null));
    expect(anonim).not.toBe(JSON.stringify(accessibilityKeys.me("u-1")));
    expect(anonim).toBe(JSON.stringify(accessibilityKeys.me(null)));
  });
});
