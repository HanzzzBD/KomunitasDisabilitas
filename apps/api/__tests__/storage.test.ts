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
  endpoint: "https://akun.r2.cloudflarestorage.com",
  region: "auto",
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
        STORAGE_ENDPOINT: "https://example.r2.cloudflarestorage.com",
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
