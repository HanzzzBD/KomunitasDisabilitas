import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

export interface ObjectStorage {
  upload(input: UploadObjectInput): Promise<StoredObject>;
  presignDownload(input: PresignDownloadInput): Promise<PresignedDownload>;
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
}

export interface CreateObjectStorageOptions {
  driver?: StorageDriver;
  clock?: () => Date;
}

function awsDriver(config: StorageConfig): StorageDriver {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
    // SDK versi baru menghitung CRC32 secara default. R2/MinIO tidak
    // memerlukannya untuk payload yang ukurannya sudah kita ketahui.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

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
      return getSignedUrl(client, new GetObjectCommand({ Bucket: input.bucket, Key: input.key }), {
        expiresIn: input.expiresInSeconds,
      });
    },
  };
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Policy layer di depan S3/R2. Provider hanya disentuh setelah key, ukuran,
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
  };
}
