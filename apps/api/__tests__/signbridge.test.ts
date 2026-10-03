// Kamus video BISINDO (PR-084) — unit: validasi publish, key media, kategori,
// pemetaan publik (URL presigned), dan audit. Tanpa DB; repository palsu.
import { describe, it, expect, vi } from "vitest";
import {
  AUDIT_ACTION,
  createSignVideoSchema,
  signVideoSearchQuerySchema,
  updateSignVideoSchema,
} from "@nawasena/schemas";
import { AppError } from "../src/core/http/index.js";
import {
  AUDIT_ENTITY,
  createSignVideosService,
  kekuranganTerbit,
  mediaKeySah,
  type SignVideoRow,
  type SignVideosRepository,
} from "../src/modules/signbridge/index.js";

const ID = "01923456-7890-7abc-8def-0123456789ab";
const ID_LAIN = "01923456-7890-7abc-8def-0123456789ac";
const AKTOR = { userId: "01923456-7890-7abc-8def-00000000000a", requestId: "req-1" };

function baris(patch: Partial<SignVideoRow> = {}): SignVideoRow {
  return {
    id: ID,
    phrase: "Terima kasih",
    category: "salam",
    status: "draft",
    videoKey: null,
    thumbnailKey: null,
    captionKey: null,
    transcript: null,
    durationS: null,
    createdBy: AKTOR.userId,
    createdAt: new Date("2026-10-03T00:00:00Z"),
    updatedAt: new Date("2026-10-03T00:00:00Z"),
    ...patch,
  };
}

const LENGKAP = {
  videoKey: `sign-videos/${ID}/source.mp4`,
  captionKey: `sign-videos/${ID}/caption.vtt`,
  transcript: "Isyarat tangan kanan di dagu lalu bergerak maju: terima kasih.",
};

function repoPalsu(awal: SignVideoRow | null) {
  let simpanan = awal;
  const repo = {
    findById: vi.fn(async () => simpanan),
    listAll: vi.fn(async () => (simpanan === null ? [] : [simpanan])),
    create: vi.fn(async (id: string, data: Record<string, unknown>) => {
      simpanan = baris({ id, ...data });
      return simpanan;
    }),
    update: vi.fn(async (_id: string, patch: Partial<SignVideoRow>) => {
      if (simpanan === null) return null;
      simpanan = { ...simpanan, ...patch };
      return simpanan;
    }),
    publish: vi.fn(async () => {
      if (simpanan === null || simpanan.status !== "draft") return null;
      simpanan = { ...simpanan, status: "published" };
      return simpanan;
    }),
    search: vi.fn(async () => (simpanan === null ? [] : [simpanan])),
  };
  return repo as typeof repo & SignVideosRepository;
}

async function galat(jalan: () => Promise<unknown>): Promise<AppError> {
  try {
    await jalan();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("Diharapkan AppError");
}

describe("mediaKeySah — key milik video ini dengan ekstensi yang cocok", () => {
  it("menerima key kanonis per jenis", () => {
    expect(mediaKeySah(ID, "videoKey", `sign-videos/${ID}/source.mp4`)).toBe(true);
    expect(mediaKeySah(ID, "videoKey", `sign-videos/${ID}/v2.WEBM`)).toBe(true);
    expect(mediaKeySah(ID, "captionKey", `sign-videos/${ID}/caption.vtt`)).toBe(true);
    expect(mediaKeySah(ID, "thumbnailKey", `sign-videos/${ID}/thumb.webp`)).toBe(true);
  });

  it.each([
    ["video lain", "videoKey", `sign-videos/${ID_LAIN}/source.mp4`],
    ["domain lain", "videoKey", `resumes/${ID}/source.mp4`],
    ["ekstensi salah", "captionKey", `sign-videos/${ID}/caption.srt`],
    ["video sebagai caption", "captionKey", `sign-videos/${ID}/source.mp4`],
    ["hanya ekstensi", "captionKey", `sign-videos/${ID}/.vtt`],
    ["kedalaman lebih", "videoKey", `sign-videos/${ID}/a/source.mp4`],
    ["traversal", "videoKey", `sign-videos/${ID}/../x.mp4`],
    ["URL", "videoKey", `https://cdn.contoh.test/sign-videos/${ID}/source.mp4`],
  ] as const)("menolak %s", (_nama, jenis, key) => {
    expect(mediaKeySah(ID, jenis, key)).toBe(false);
  });
});

describe("kekuranganTerbit", () => {
  it("menyebut setiap yang kurang, berurutan", () => {
    expect(kekuranganTerbit(baris())).toEqual(["video", "caption (.vtt)", "transkrip"]);
    expect(kekuranganTerbit(baris({ ...LENGKAP, transcript: "   " }))).toEqual(["transkrip"]);
    expect(kekuranganTerbit(baris(LENGKAP))).toEqual([]);
  });
});

describe("skema — kategori tervalidasi", () => {
  it("menolak kategori di luar daftar tertutup", () => {
    const hasil = createSignVideoSchema.safeParse({ phrase: "Halo", category: "olahraga" });
    expect(hasil.success).toBe(false);
    expect(signVideoSearchQuerySchema.safeParse({ category: "olahraga" }).success).toBe(false);
  });

  it("menerima kategori sah dan memangkas frasa", () => {
    const hasil = createSignVideoSchema.parse({ phrase: "  Halo  ", category: "salam" });
    expect(hasil.phrase).toBe("Halo");
  });

  it("menolak PUT kosong dan field asing", () => {
    expect(updateSignVideoSchema.safeParse({}).success).toBe(false);
    expect(updateSignVideoSchema.safeParse({ status: "published" }).success).toBe(false);
  });
});

describe("publish — caption + transkrip ditegakkan server", () => {
  it("draft tanpa media → 422 dengan hint daftar kurang, tanpa audit", async () => {
    const auditLog = vi.fn();
    const repo = repoPalsu(baris());
    const service = createSignVideosService({ repository: repo, auditLog, storage: undefined });

    const err = await galat(() => service.publish(AKTOR, ID));
    expect(err.code).toBe("VIDEO_ISYARAT_BELUM_LENGKAP");
    expect(err.status).toBe(422);
    expect(err.hint).toBe("Lengkapi dulu: video, caption (.vtt), transkrip");
    expect(repo.publish).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("video tanpa caption → 422 menyebut caption saja", async () => {
    const repo = repoPalsu(baris({ videoKey: LENGKAP.videoKey, transcript: LENGKAP.transcript }));
    const service = createSignVideosService({
      repository: repo,
      auditLog: vi.fn(),
      storage: undefined,
    });
    const err = await galat(() => service.publish(AKTOR, ID));
    expect(err.hint).toBe("Lengkapi dulu: caption (.vtt)");
  });

  it("lengkap → published + audit publish", async () => {
    const auditLog = vi.fn();
    const service = createSignVideosService({
      repository: repoPalsu(baris(LENGKAP)),
      auditLog,
      storage: undefined,
    });
    const hasil = await service.publish(AKTOR, ID);
    expect(hasil.status).toBe("published");
    expect(auditLog).toHaveBeenCalledWith(
      { actorId: AKTOR.userId, requestId: AKTOR.requestId },
      AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
      AUDIT_ENTITY,
      ID,
      { operation: "publish" },
    );
  });

  it("sudah terbit → 409; tidak ada → 404", async () => {
    const terbit = createSignVideosService({
      repository: repoPalsu(baris({ ...LENGKAP, status: "published" })),
      auditLog: vi.fn(),
      storage: undefined,
    });
    expect((await galat(() => terbit.publish(AKTOR, ID))).code).toBe("VIDEO_ISYARAT_SUDAH_TERBIT");

    const kosong = createSignVideosService({
      repository: repoPalsu(null),
      auditLog: vi.fn(),
      storage: undefined,
    });
    expect((await galat(() => kosong.publish(AKTOR, ID))).code).toBe(
      "VIDEO_ISYARAT_TIDAK_DITEMUKAN",
    );
  });
});

describe("update", () => {
  it("menolak key media milik video lain (422) tanpa menyentuh DB", async () => {
    const repo = repoPalsu(baris());
    const service = createSignVideosService({
      repository: repo,
      auditLog: vi.fn(),
      storage: undefined,
    });
    const err = await galat(() =>
      service.update(AKTOR, ID, { videoKey: `sign-videos/${ID_LAIN}/source.mp4` }),
    );
    expect(err.code).toBe("MEDIA_VIDEO_ISYARAT_TIDAK_VALID");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("entri terbit tidak boleh kehilangan caption/transkrip (422)", async () => {
    const repo = repoPalsu(baris({ ...LENGKAP, status: "published" }));
    const service = createSignVideosService({
      repository: repo,
      auditLog: vi.fn(),
      storage: undefined,
    });
    const err = await galat(() => service.update(AKTOR, ID, { captionKey: null }));
    expect(err.code).toBe("VIDEO_ISYARAT_BELUM_LENGKAP");
    expect(err.hint).toBe("Lengkapi dulu: caption (.vtt)");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("draft boleh dikosongkan; patch tersimpan + audit update", async () => {
    const auditLog = vi.fn();
    const service = createSignVideosService({
      repository: repoPalsu(baris(LENGKAP)),
      auditLog,
      storage: undefined,
    });
    const hasil = await service.update(AKTOR, ID, { captionKey: null, phrase: "Makasih" });
    expect(hasil.captionKey).toBeNull();
    expect(hasil.phrase).toBe("Makasih");
    expect(auditLog.mock.calls[0]?.[4]).toEqual({ operation: "update" });
  });
});

describe("search — publik", () => {
  it("storage belum diatur → 503 BELUM_SIAP", async () => {
    const service = createSignVideosService({
      repository: repoPalsu(baris({ ...LENGKAP, status: "published" })),
      auditLog: vi.fn(),
      storage: undefined,
    });
    expect((await galat(() => service.search({ limit: 24 }))).code).toBe("BELUM_SIAP");
  });

  it("memetakan key → URL presigned; kedaluwarsa = yang paling awal; key tidak bocor", async () => {
    const presignDownload = vi.fn(async ({ key }: { key: string }) => ({
      url: `https://minio.test/${key}?sig=1`,
      expiresAt: new Date(key.endsWith(".vtt") ? "2026-10-03T00:04:00Z" : "2026-10-03T00:05:00Z"),
    }));
    const service = createSignVideosService({
      repository: repoPalsu(baris({ ...LENGKAP, status: "published" })),
      auditLog: vi.fn(),
      storage: { presignDownload },
    });

    const [entri] = await service.search({ query: "terima", limit: 24 });
    expect(entri).toEqual({
      id: ID,
      phrase: "Terima kasih",
      category: "salam",
      transcript: LENGKAP.transcript,
      durationS: null,
      videoUrl: `https://minio.test/${LENGKAP.videoKey}?sig=1`,
      captionUrl: `https://minio.test/${LENGKAP.captionKey}?sig=1`,
      thumbnailUrl: null,
      mediaExpiresAt: "2026-10-03T00:04:00.000Z",
    });
    expect(presignDownload).toHaveBeenCalledTimes(2);
  });
});
