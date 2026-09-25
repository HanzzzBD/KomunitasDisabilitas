/** Storage belum dikonfigurasi lengkap; fitur pemakainya harus gagal tertutup. */
export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Object storage belum dikonfigurasi. Isi STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, " +
        "STORAGE_SECRET_ACCESS_KEY, STORAGE_BUCKET_PREFIX, dan STORAGE_BUCKET_ENV.",
    );
    this.name = "StorageNotConfiguredError";
  }
}

/** Key ditolak sebelum dikirim ke provider agar tidak ada path traversal/PII bebas. */
export class InvalidStorageKeyError extends Error {
  constructor(message: string) {
    super(`Key object storage tidak valid: ${message}`);
    this.name = "InvalidStorageKeyError";
  }
}

/** Payload lebih besar daripada batas efektif (global atau batas pemanggil). */
export class StorageUploadTooLargeError extends Error {
  readonly actualBytes: number;
  readonly maxBytes: number;

  constructor(actualBytes: number, maxBytes: number) {
    super(`Ukuran upload ${actualBytes} byte melebihi batas ${maxBytes} byte`);
    this.name = "StorageUploadTooLargeError";
    this.actualBytes = actualBytes;
    this.maxBytes = maxBytes;
  }
}

/** TTL presign harus positif dan tidak boleh melewati kebijakan global. */
export class InvalidPresignTtlError extends Error {
  constructor(ttlSeconds: number, maxSeconds: number) {
    super(`TTL presign ${ttlSeconds} detik tidak valid; rentang yang diizinkan 1-${maxSeconds}`);
    this.name = "InvalidPresignTtlError";
  }
}
