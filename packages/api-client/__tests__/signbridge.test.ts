// Endpoint kamus BISINDO admin (PR-084/085a server; PR-085b konsumen).
//
// YANG DIUJI: amplop `{ data }` dibuka, badan divalidasi SEBELUM berangkat
// (berkas yang pasti ditolak tidak memakan permintaan), dan aksi status tidak
// mengirim badan.
import { describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  createSignVideoAdmin,
  getSignVideo,
  listSignVideosAdmin,
  presignSignVideoMedia,
  publishSignVideoAdmin,
  searchSignVideos,
  signVideosKeys,
  unpublishSignVideoAdmin,
  updateSignVideoAdmin,
} from "../src/index.js";

const ID = "01912345-89ab-7def-8123-456789abcdef";
const ENTRI = {
  id: ID,
  phrase: "Terima kasih",
  category: "salam",
  status: "draft",
  videoKey: null,
  thumbnailKey: null,
  captionKey: null,
  transcript: null,
  durationS: null,
  createdBy: null,
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function klien(fetch: ReturnType<typeof vi.fn>) {
  return createApiClient({
    baseUrl: "https://x/api/v1",
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
}

function permintaan(fetch: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

describe("kamus admin — CRUD & status", () => {
  it("list membuka amplop; key cache tanpa params", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [ENTRI] }));
    expect(await listSignVideosAdmin(klien(fetch))).toEqual([ENTRI]);
    expect(permintaan(fetch).url).toBe("https://x/api/v1/admin/sign-videos");
    expect(signVideosKeys.adminList()).toEqual(["admin-sign-videos"]);
  });

  it("create memvalidasi kategori sebelum berangkat", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(201, { data: ENTRI }));
    await expect(
      createSignVideoAdmin(klien(fetch), { phrase: "Halo", category: "olahraga" as never }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();

    await createSignVideoAdmin(klien(fetch), { phrase: " Halo ", category: "salam" });
    const { init } = permintaan(fetch);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ phrase: "Halo", category: "salam" });
  });

  it("update mengirim PUT sebagian", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: ENTRI }));
    await updateSignVideoAdmin(klien(fetch), ID, { captionKey: `sign-videos/${ID}/c.vtt` });
    const { url, init } = permintaan(fetch);
    expect(url).toBe(`https://x/api/v1/admin/sign-videos/${ID}`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ captionKey: `sign-videos/${ID}/c.vtt` });
  });

  it.each([
    ["publish", publishSignVideoAdmin],
    ["unpublish", unpublishSignVideoAdmin],
  ] as const)("%s = POST tanpa badan", async (aksi, fungsi) => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: ENTRI }));
    await fungsi(klien(fetch), ID);
    const { url, init } = permintaan(fetch);
    expect(url).toBe(`https://x/api/v1/admin/sign-videos/${ID}/${aksi}`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });
});

describe("presignSignVideoMedia", () => {
  it("video > 50 MB atau tipe asing ditolak tanpa permintaan", async () => {
    const fetch = vi.fn();
    const dasar = { videoId: ID, kind: "video" as const, contentType: "video/mp4", size: 1 };
    await expect(
      presignSignVideoMedia(klien(fetch), { ...dasar, size: 50 * 1024 * 1024 + 1 }),
    ).rejects.toThrow();
    await expect(
      presignSignVideoMedia(klien(fetch), { ...dasar, contentType: "video/quicktime" }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("izin sah dibuka dari amplop", async () => {
    const izin = {
      key: `sign-videos/${ID}/caption-x.vtt`,
      uploadUrl: "https://storage.test/put?sig=1",
      method: "PUT",
      headers: { "content-type": "text/vtt" },
      expiresAt: "2026-10-03T00:05:00.000Z",
    };
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: izin }));
    const hasil = await presignSignVideoMedia(klien(fetch), {
      videoId: ID,
      kind: "caption",
      contentType: "text/vtt",
      size: 120,
    });
    expect(hasil).toEqual(izin);
    expect(permintaan(fetch).url).toBe("https://x/api/v1/admin/sign-videos/presign");
  });
});

describe("kamus publik (PR-086)", () => {
  const PUBLIK = {
    id: ID,
    phrase: "Terima kasih",
    category: "salam",
    transcript: "Tangan kanan di dagu.",
    durationS: null,
    videoUrl: "https://storage.test/v.mp4?sig=1",
    captionUrl: "https://storage.test/c.vtt?sig=1",
    thumbnailUrl: null,
    mediaExpiresAt: "2026-10-03T00:05:00.000Z",
  };

  it("search menyusun query hanya dari filter yang diisi", async () => {
    const fetch = vi.fn(() => Promise.resolve(jsonResponse(200, { data: [PUBLIK] })));
    expect(
      await searchSignVideos(klien(fetch), { query: "terima kasih", category: "salam" }),
    ).toEqual([PUBLIK]);
    expect(permintaan(fetch).url).toBe(
      "https://x/api/v1/sign-videos?query=terima+kasih&category=salam",
    );
    fetch.mockClear();
    await searchSignVideos(klien(fetch), { query: "" });
    expect(permintaan(fetch).url).toBe("https://x/api/v1/sign-videos");
  });

  it("detail membuka amplop; key cache dilingkupi id", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PUBLIK }));
    expect(await getSignVideo(klien(fetch), ID)).toEqual(PUBLIK);
    expect(permintaan(fetch).url).toBe(`https://x/api/v1/sign-videos/${ID}`);
    expect(signVideosKeys.detail(ID)).toEqual(["sign-video", { id: ID }]);
  });
});
