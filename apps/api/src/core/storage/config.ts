import type { Env } from "../config/index.js";
import { StorageNotConfiguredError } from "./errors.js";

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
  maxUploadBytes: number;
  presignTtlSeconds: number;
}

export type StorageEnvironment = "development" | "test" | "staging" | "production";

/** Nama bucket tidak pernah diterima utuh: environment selalu menjadi suffix. */
export function buildStorageBucketName(prefix: string, environment: StorageEnvironment): string {
  return `${prefix}-${environment}`;
}

/**
 * Ubah env tervalidasi menjadi config provider. Ketiadaan seluruh grup sah
 * saat boot, tetapi pemakaian storage gagal tertutup dengan error eksplisit.
 */
export function storageConfigFromEnv(env: Env): StorageConfig {
  if (
    env.STORAGE_ENDPOINT === undefined ||
    env.STORAGE_ACCESS_KEY_ID === undefined ||
    env.STORAGE_SECRET_ACCESS_KEY === undefined ||
    env.STORAGE_BUCKET_PREFIX === undefined ||
    env.STORAGE_BUCKET_ENV === undefined
  ) {
    throw new StorageNotConfiguredError();
  }

  return {
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    bucket: buildStorageBucketName(env.STORAGE_BUCKET_PREFIX, env.STORAGE_BUCKET_ENV),
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    maxUploadBytes: env.STORAGE_MAX_UPLOAD_BYTES,
    presignTtlSeconds: env.STORAGE_PRESIGN_TTL_SECONDS,
  };
}
