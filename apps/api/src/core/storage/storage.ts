import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { InvalidPresignTtlError, StorageUploadTooLargeError } from "./errors.js";
import { assertStorageKey } from "./paths.js";
import type { StorageConfig } from "./config.js";

export interface UploadObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  /** Kebijakan domain yang lebih ketat; tidak pernah dapat melonggarkan batas global. */
  maxBytes?: number;
  cacheControl?: string;
  contentDisposition?: string;
}

export interface StoredObject {
  key: string;
  size: number;
}

export interface PresignDownloadInput {
  key: string;
  /** Bila absen, gunakan default config. Tidak boleh melebihi default itu. */
  expiresInSeconds?: number;
}

export interface PresignedDownload {
  url: string;
  expiresAt: Date;
}

export interface PresignUploadInput {
  key: string;
  contentType: string;
  /** Ukuran PERSIS berkas; ikut ditandatangani, jadi PUT dengan ukuran lain ditolak provider. */
  contentLength: number;
  /** Kebijakan domain yang lebih ketat; tidak pernah dapat melonggarkan batas global. */
  maxBytes?: number;
  expiresInSeconds?: number;
}

export interface PresignedUpload {
  url: string;
  method: "PUT";
  /** Header yang WAJIB dikirim browser apa adanya (bagian dari signature). */
  headers: Record<string, string>;
  expiresAt: Date;
}

/** Metadata objek yang SUDAH ada; `null` dari `stat` = objek tidak ada. */
export interface ObjectStat {
  size: number;
  contentType: string | null;
}

export interface ObjectStorage {
  upload(input: UploadObjectInput): Promise<StoredObject>;
  presignDownload(input: PresignDownloadInput): Promise<PresignedDownload>;
  /** Unggah langsung dari browser (PR-085) — bucket tetap privat, tanpa list. */
  presignUpload(input: PresignUploadInput): Promise<PresignedUpload>;
  stat(key: string): Promise<ObjectStat | null>;
}

/** Port sempit agar kebijakan storage dapat diuji tanpa jaringan. */
export interface StorageDriver {
  put(input: {
    bucket: string;
    key: string;
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
    contentDisposition?: string;
  }): Promise<void>;
  presignGet(input: { bucket: string; key: string; expiresInSeconds: number }): Promise<string>;
  presignPut(input: {
    bucket: string;
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<string>;
  head(input: { bucket: string; key: string }): Promise<ObjectStat | null>;
}

export interface CreateObjectStorageOptions {
  driver?: StorageDriver;
  clock?: () => Date;
}

function s3Client(config: StorageConfig, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
    // SDK versi baru menghitung CRC32 secara default. B2/MinIO tidak
    // memerlukannya untuk payload yang ukurannya sudah kita ketahui.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function awsDriver(config: StorageConfig): StorageDriver {
  const client = s3Client(config, config.endpoint);
  // Host ikut ditandatangani SigV4, jadi URL untuk browser harus DITANDATANGANI
  // dengan host publik, bukan sekadar diganti host-nya. Presign berjalan
  // offline — client kedua ini tidak pernah membuka koneksi.
  const presigner =
    config.publicEndpoint === undefined ? client : s3Client(config, config.publicEndpoint);

  return {
    async put(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.body,
          ContentLength: input.body.byteLength,
          ContentType: input.contentType,
          ...(input.cacheControl === undefined ? {} : { CacheControl: input.cacheControl }),
          ...(input.contentDisposition === undefined
            ? {}
            : { ContentDisposition: input.contentDisposition }),
        }),
      );
    },

    presignGet(input) {
      return getSignedUrl(
        presigner,
        new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
        {
          expiresIn: input.expiresInSeconds,
        },
      );
    },

    presignPut(input) {
      return getSignedUrl(
        presigner,
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
        }),
        {
          expiresIn: input.expiresInSeconds,
          // Tanpa ini presigner "mengangkat" header ke query string dan
          // content-length tidak ikut terikat. Ditandatangani sebagai header,
          // browser yang mengirim ukuran lain mendapat 403 dari provider.
          signableHeaders: new Set(["content-type", "content-length"]),
          unhoistableHeaders: new Set(["content-type", "content-length"]),
        },
      );
    },

    async head(input) {
      try {
        const res = await client.send(
          new HeadObjectCommand({ Bucket: input.bucket, Key: input.key }),
        );
        return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
      } catch (err) {
        if (err instanceof NotFound) return null;
        // HEAD tidak punya badan: sebagian provider menjawab 404 tanpa kode bernama.
        if (
          (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
        ) {
          return null;
        }
        throw err;
      }
    },
  };
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Policy layer di depan S3/B2. Provider hanya disentuh setelah key, ukuran,
 * dan TTL lolos; tidak ada operasi list maupun pembuatan URL publik.
 */
export function createObjectStorage(
  config: StorageConfig,
  options: CreateObjectStorageOptions = {},
): ObjectStorage {
  const driver = options.driver ?? awsDriver(config);
  const clock = options.clock ?? (() => new Date());

  return {
    async upload(input) {
      assertStorageKey(input.key);
      if (!(input.body instanceof Uint8Array)) {
        throw new TypeError("body upload harus Uint8Array");
      }

      const requestedMax = input.maxBytes ?? config.maxUploadBytes;
      if (!positiveInteger(requestedMax)) {
        throw new RangeError("maxBytes upload harus bilangan bulat positif");
      }
      const effectiveMax = Math.min(requestedMax, config.maxUploadBytes);
      if (input.body.byteLength > effectiveMax) {
        throw new StorageUploadTooLargeError(input.body.byteLength, effectiveMax);
      }

      await driver.put({
        bucket: config.bucket,
        key: input.key,
        body: input.body,
        contentType: input.contentType,
        ...(input.cacheControl === undefined ? {} : { cacheControl: input.cacheControl }),
        ...(input.contentDisposition === undefined
          ? {}
          : { contentDisposition: input.contentDisposition }),
      });
      return { key: input.key, size: input.body.byteLength };
    },

    async presignDownload(input) {
      assertStorageKey(input.key);
      const ttl = input.expiresInSeconds ?? config.presignTtlSeconds;
      if (!positiveInteger(ttl) || ttl > config.presignTtlSeconds) {
        throw new InvalidPresignTtlError(ttl, config.presignTtlSeconds);
      }

      const issuedAt = clock();
      const url = await driver.presignGet({
        bucket: config.bucket,
        key: input.key,
        expiresInSeconds: ttl,
      });
      return { url, expiresAt: new Date(issuedAt.getTime() + ttl * 1_000) };
    },

    async presignUpload(input) {
      assertStorageKey(input.key);
      const requestedMax = input.maxBytes ?? config.maxUploadBytes;
      if (!positiveInteger(requestedMax)) {
        throw new RangeError("maxBytes upload harus bilangan bulat positif");
      }
      const effectiveMax = Math.min(requestedMax, config.maxUploadBytes);
      if (!positiveInteger(input.contentLength)) {
        throw new RangeError("contentLength harus bilangan bulat positif");
      }
      if (input.contentLength > effectiveMax) {
        throw new StorageUploadTooLargeError(input.contentLength, effectiveMax);
      }
      const ttl = input.expiresInSeconds ?? config.presignTtlSeconds;
      if (!positiveInteger(ttl) || ttl > config.presignTtlSeconds) {
        throw new InvalidPresignTtlError(ttl, config.presignTtlSeconds);
      }

      const issuedAt = clock();
      const url = await driver.presignPut({
        bucket: config.bucket,
        key: input.key,
        contentType: input.contentType,
        contentLength: input.contentLength,
        expiresInSeconds: ttl,
      });
      return {
        url,
        method: "PUT",
        headers: { "content-type": input.contentType },
        expiresAt: new Date(issuedAt.getTime() + ttl * 1_000),
      };
    },

    async stat(key) {
      assertStorageKey(key);
      return driver.head({ bucket: config.bucket, key });
    },
  };
}
