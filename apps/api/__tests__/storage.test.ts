import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/core/config/index.js";
import {
  InvalidPresignTtlError,
  InvalidStorageKeyError,
  StorageNotConfiguredError,
  StorageUploadTooLargeError,
  buildStorageBucketName,
  buildStorageKey,
  createObjectStorage,
  resumePdfKey,
  storageConfigFromEnv,
  type StorageConfig,
  type StorageDriver,
} from "../src/core/storage/index.js";

const VALID_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/nawasena",
  REDIS_URL: "redis://localhost:6379",
  REDIS_QUEUE_URL: "redis://localhost:6380",
};

const CONFIG: StorageConfig = {
  endpoint: "https://s3.us-west-004.backblazeb2.com",
  region: "us-west-004",
  accessKeyId: "access-uji",
  secretAccessKey: "secret-uji",
  bucket: "nawasena-test",
  forcePathStyle: false,
  maxUploadBytes: 8,
  presignTtlSeconds: 300,
};

function fakeDriver(): StorageDriver & {
  put: ReturnType<typeof vi.fn>;
  presignGet: ReturnType<typeof vi.fn>;
} {
  return {
    put: vi.fn(() => Promise.resolve()),
    presignGet: vi.fn(() => Promise.resolve("https://signed.example/object?signature=uji")),
  };
}

describe("storage path convention", () => {
  it("membentuk key domain/segmen tanpa prefix environment", () => {
    expect(buildStorageKey("sign-videos", "video-1", "source.mp4")).toBe(
      "sign-videos/video-1/source.mp4",
    );
  });

  it("membentuk path PDF deterministik dari user, resume, dan hash konten", () => {
    const hash = "a".repeat(64);
    expect(resumePdfKey({ userId: "user-1", resumeId: "resume-1", contentHash: hash })).toBe(
      `resumes/user-1/resume-1/${hash}.pdf`,
    );
  });

  it.each([
    ["pemisah path", () => buildStorageKey("resumes", "user/asing")],
    ["traversal", () => buildStorageKey("resumes", "..", "cv.pdf")],
    [
      "hash bukan SHA-256",
      () => resumePdfKey({ userId: "u-1", resumeId: "r-1", contentHash: "abc" }),
    ],
  ])("menolak %s", (_nama, aksi) => {
    expect(aksi).toThrow(InvalidStorageKeyError);
  });
});

describe("storage config", () => {
  it("bucket development/test/staging/production selalu berbeda", () => {
    expect(
      new Set([
        buildStorageBucketName("nawasena", "development"),
        buildStorageBucketName("nawasena", "test"),
        buildStorageBucketName("nawasena", "staging"),
        buildStorageBucketName("nawasena", "production"),
      ]).size,
    ).toBe(4);
  });

  it("grup storage kosong sah saat boot tetapi gagal tertutup saat dipakai", () => {
    const env = loadEnv(VALID_ENV);
    expect(() => storageConfigFromEnv(env)).toThrow(StorageNotConfiguredError);
  });

  it("konfigurasi lengkap menghasilkan nama bucket bersuffix environment", () => {
    const env = loadEnv({
      ...VALID_ENV,
      NODE_ENV: "test",
      STORAGE_ENDPOINT: "http://127.0.0.1:9000",
      STORAGE_ACCESS_KEY_ID: "minio",
      STORAGE_SECRET_ACCESS_KEY: "minio-rahasia",
      STORAGE_BUCKET_PREFIX: "nawasena",
      STORAGE_BUCKET_ENV: "test",
      STORAGE_REGION: "us-east-1",
      STORAGE_FORCE_PATH_STYLE: "true",
    });

    expect(storageConfigFromEnv(env)).toMatchObject({
      bucket: "nawasena-test",
      region: "us-east-1",
      forcePathStyle: true,
    });
  });

  it("kredensial setengah lengkap ditolak saat loadEnv", () => {
    expect(() =>
      loadEnv({
        ...VALID_ENV,
        STORAGE_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
      }),
    ).toThrow(/STORAGE_ACCESS_KEY_ID/);
  });

  it("endpoint production wajib HTTPS", () => {
    expect(() =>
      loadEnv({
        ...VALID_ENV,
        NODE_ENV: "production",
        STORAGE_ENDPOINT: "http://storage.internal",
        STORAGE_ACCESS_KEY_ID: "access",
        STORAGE_SECRET_ACCESS_KEY: "secret",
        STORAGE_BUCKET_PREFIX: "nawasena",
        STORAGE_BUCKET_ENV: "production",
      }),
    ).toThrow(/STORAGE_ENDPOINT/);
  });

  it("staging memakai mode Node production tetapi bucket staging sendiri", () => {
    const env = loadEnv({
      ...VALID_ENV,
      NODE_ENV: "production",
      STORAGE_ENDPOINT: "https://storage.example.test",
      STORAGE_ACCESS_KEY_ID: "access",
      STORAGE_SECRET_ACCESS_KEY: "secret",
      STORAGE_BUCKET_PREFIX: "nawasena",
      STORAGE_BUCKET_ENV: "staging",
      // PR-083 — production wajib alamat banding.
      SUPPORT_EMAIL: "dukungan@contoh.test",
    });

    expect(storageConfigFromEnv(env).bucket).toBe("nawasena-staging");
  });

  it("suffix bucket yang tidak cocok dengan mode runtime ditolak", () => {
    expect(() =>
      loadEnv({
        ...VALID_ENV,
        NODE_ENV: "test",
        STORAGE_ENDPOINT: "http://127.0.0.1:9000",
        STORAGE_ACCESS_KEY_ID: "access",
        STORAGE_SECRET_ACCESS_KEY: "secret",
        STORAGE_BUCKET_PREFIX: "nawasena",
        STORAGE_BUCKET_ENV: "production",
      }),
    ).toThrow(/STORAGE_BUCKET_ENV/);
  });
});

describe("ObjectStorage policy", () => {
  it("upload meneruskan bucket privat dan metadata objek ke driver", async () => {
    const driver = fakeDriver();
    const storage = createObjectStorage(CONFIG, { driver });
    const body = new TextEncoder().encode("pdf");

    await expect(
      storage.upload({
        key: "resumes/user-1/resume-1/cv.pdf",
        body,
        contentType: "application/pdf",
        cacheControl: "private, no-store",
      }),
    ).resolves.toEqual({ key: "resumes/user-1/resume-1/cv.pdf", size: 3 });

    expect(driver.put).toHaveBeenCalledWith({
      bucket: "nawasena-test",
      key: "resumes/user-1/resume-1/cv.pdf",
      body,
      contentType: "application/pdf",
      cacheControl: "private, no-store",
    });
  });

  it("ukuran global ditegakkan sebelum provider disentuh", async () => {
    const driver = fakeDriver();
    const storage = createObjectStorage(CONFIG, { driver });

    await expect(
      storage.upload({
        key: "resumes/user-1/terlalu-besar.pdf",
        body: new Uint8Array(9),
        contentType: "application/pdf",
      }),
    ).rejects.toMatchObject({ actualBytes: 9, maxBytes: 8 });
    expect(driver.put).not.toHaveBeenCalled();
  });

  it("batas domain dapat memperketat tetapi tidak melonggarkan batas global", async () => {
    const driver = fakeDriver();
    const storage = createObjectStorage(CONFIG, { driver });
    const common = {
      key: "sign-videos/video-1/source.mp4",
      body: new Uint8Array(6),
      contentType: "video/mp4",
    };

    await expect(storage.upload({ ...common, maxBytes: 5 })).rejects.toBeInstanceOf(
      StorageUploadTooLargeError,
    );
    await expect(storage.upload({ ...common, maxBytes: 999 })).resolves.toMatchObject({ size: 6 });
  });

  it("presign memakai TTL terbatas dan mengembalikan waktu kedaluwarsa eksplisit", async () => {
    const driver = fakeDriver();
    const now = new Date("2026-09-25T00:00:00.000Z");
    const storage = createObjectStorage(CONFIG, { driver, clock: () => now });

    await expect(
      storage.presignDownload({ key: "resumes/user-1/resume-1/cv.pdf", expiresInSeconds: 60 }),
    ).resolves.toEqual({
      url: "https://signed.example/object?signature=uji",
      expiresAt: new Date("2026-09-25T00:01:00.000Z"),
    });
    expect(driver.presignGet).toHaveBeenCalledWith({
      bucket: "nawasena-test",
      key: "resumes/user-1/resume-1/cv.pdf",
      expiresInSeconds: 60,
    });
  });

  it.each([0, 1.5, 301])("TTL %s ditolak sebelum provider disentuh", async (ttl) => {
    const driver = fakeDriver();
    const storage = createObjectStorage(CONFIG, { driver });

    await expect(
      storage.presignDownload({ key: "resumes/user-1/resume-1/cv.pdf", expiresInSeconds: ttl }),
    ).rejects.toBeInstanceOf(InvalidPresignTtlError);
    expect(driver.presignGet).not.toHaveBeenCalled();
  });
});

// U-23 (PR-064b): di jaringan compose, API mengunggah ke `minio:9000` tetapi
// browser hanya bisa membuka `127.0.0.1:9000`. Driver asli dipakai di sini —
// presign SigV4 berjalan offline, jadi tidak ada koneksi yang dibuka.
describe("URL presigned untuk browser", () => {
  const MINIO: StorageConfig = {
    ...CONFIG,
    endpoint: "http://minio:9000",
    region: "us-east-1",
    forcePathStyle: true,
  };
  const KEY = "resumes/user-1/resume-1/cv.pdf";

  it("tanpa endpoint publik, URL memakai endpoint internal (perilaku B2/produksi)", async () => {
    const { url } = await createObjectStorage(MINIO).presignDownload({ key: KEY });
    expect(new URL(url).host).toBe("minio:9000");
  });

  it("endpoint publik menandatangani URL untuk host yang dapat dibuka browser", async () => {
    const { url } = await createObjectStorage({
      ...MINIO,
      publicEndpoint: "http://127.0.0.1:9000",
    }).presignDownload({ key: KEY });

    const parsed = new URL(url);
    expect(parsed.host).toBe("127.0.0.1:9000");
    expect(parsed.pathname).toBe(`/nawasena-test/${KEY}`);
    // Host adalah bagian dari tanda tangan, bukan hasil ganti-string pasca-sign.
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("STORAGE_PUBLIC_ENDPOINT masuk ke config dan ditolak tanpa STORAGE_ENDPOINT", () => {
    const lengkap = {
      ...VALID_ENV,
      NODE_ENV: "test",
      STORAGE_ENDPOINT: "http://minio:9000",
      STORAGE_PUBLIC_ENDPOINT: "http://127.0.0.1:9000",
      STORAGE_ACCESS_KEY_ID: "minio",
      STORAGE_SECRET_ACCESS_KEY: "minio-rahasia",
      STORAGE_BUCKET_PREFIX: "nawasena",
      STORAGE_BUCKET_ENV: "test",
    };
    expect(storageConfigFromEnv(loadEnv(lengkap)).publicEndpoint).toBe("http://127.0.0.1:9000");

    expect(() =>
      loadEnv({ ...VALID_ENV, STORAGE_PUBLIC_ENDPOINT: "http://127.0.0.1:9000" }),
    ).toThrow(/STORAGE_PUBLIC_ENDPOINT/);
  });

  it("endpoint publik production wajib HTTPS", () => {
    expect(() =>
      loadEnv({
        ...VALID_ENV,
        NODE_ENV: "production",
        STORAGE_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
        STORAGE_PUBLIC_ENDPOINT: "http://cdn.nawasena.id",
        STORAGE_ACCESS_KEY_ID: "access",
        STORAGE_SECRET_ACCESS_KEY: "secret",
        STORAGE_BUCKET_PREFIX: "nawasena",
        STORAGE_BUCKET_ENV: "production",
      }),
    ).toThrow(/STORAGE_PUBLIC_ENDPOINT/);
  });
});

// ADR-020: region B2 ikut ditandatangani SigV4. Region yang salah tidak gagal
// saat boot melainkan pada upload pertama, sebagai `SignatureDoesNotMatch`.
describe("Backblaze B2", () => {
  const B2_ENV: NodeJS.ProcessEnv = {
    ...VALID_ENV,
    NODE_ENV: "production",
    SUPPORT_EMAIL: "dukungan@contoh.test",
    STORAGE_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com",
    STORAGE_ACCESS_KEY_ID: "key-id-b2",
    STORAGE_SECRET_ACCESS_KEY: "application-key-b2",
    STORAGE_BUCKET_PREFIX: "nawasena-uji",
    STORAGE_BUCKET_ENV: "production",
  };

  it("region diturunkan dari host endpoint bila STORAGE_REGION kosong", () => {
    expect(storageConfigFromEnv(loadEnv(B2_ENV)).region).toBe("eu-central-003");
  });

  it("STORAGE_REGION yang sama dengan host diterima", () => {
    const env = loadEnv({ ...B2_ENV, STORAGE_REGION: "eu-central-003" });
    expect(storageConfigFromEnv(env).region).toBe("eu-central-003");
  });

  it("STORAGE_REGION yang bertentangan dengan host ditolak saat boot", () => {
    expect(() => loadEnv({ ...B2_ENV, STORAGE_REGION: "auto" })).toThrow(
      /STORAGE_REGION: tidak cocok dengan endpoint B2 \(region-nya eu-central-003\)/,
    );
  });

  it("endpoint selain B2 tanpa STORAGE_REGION memakai us-east-1", () => {
    const env = loadEnv({
      ...VALID_ENV,
      NODE_ENV: "test",
      STORAGE_ENDPOINT: "http://127.0.0.1:9010",
      STORAGE_ACCESS_KEY_ID: "minio",
      STORAGE_SECRET_ACCESS_KEY: "minio-rahasia",
      STORAGE_BUCKET_PREFIX: "nawasena",
      STORAGE_BUCKET_ENV: "test",
    });
    expect(storageConfigFromEnv(env).region).toBe("us-east-1");
  });

  it("prefix bucket berawalan b2- ditolak (dicadangkan Backblaze)", () => {
    expect(() => loadEnv({ ...B2_ENV, STORAGE_BUCKET_PREFIX: "b2-nawasena" })).toThrow(
      /STORAGE_BUCKET_PREFIX/,
    );
  });

  it("URL presigned ditandatangani untuk region B2", async () => {
    const config = storageConfigFromEnv(loadEnv(B2_ENV));
    const { url } = await createObjectStorage(config).presignDownload({
      key: "resumes/user-1/resume-1/cv.pdf",
    });
    const parsed = new URL(url);
    expect(parsed.host).toBe("nawasena-uji-production.s3.eu-central-003.backblazeb2.com");
    expect(parsed.searchParams.get("X-Amz-Credential")).toContain(
      "/eu-central-003/s3/aws4_request",
    );
  });
});
