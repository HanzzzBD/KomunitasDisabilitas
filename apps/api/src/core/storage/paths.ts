import { InvalidStorageKeyError } from "./errors.js";

/**
 * Domain tingkat pertama yang boleh hidup di object storage.
 *
 * Daftar tertutup ini disengaja: domain baru harus ditambahkan lewat review,
 * bukan lahir dari string bebas yang akhirnya menjadi pseudo-bucket liar.
 */
export const STORAGE_DOMAINS = ["resumes", "sign-videos", "backups"] as const;
export type StorageDomain = (typeof STORAGE_DOMAINS)[number];

const STORAGE_DOMAIN_SET = new Set<string>(STORAGE_DOMAINS);
const SAFE_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;

function assertSegment(segment: string): void {
  if (segment === "." || segment === "..") {
    throw new InvalidStorageKeyError("segmen '.' dan '..' dilarang");
  }
  if (!SAFE_SEGMENT.test(segment)) {
    throw new InvalidStorageKeyError(
      `segmen '${segment}' harus 1-128 karakter alfanumerik/._- tanpa pemisah path`,
    );
  }
}

/**
 * Bentuk key kanonis: `<domain>/<scope>/<resource>/<artifact>`.
 * Environment tidak masuk key karena isolasinya terjadi pada tingkat bucket.
 */
export function buildStorageKey(domain: StorageDomain, ...segments: readonly string[]): string {
  if (!STORAGE_DOMAIN_SET.has(domain)) {
    throw new InvalidStorageKeyError(`domain '${domain}' tidak dikenal`);
  }
  if (segments.length === 0) {
    throw new InvalidStorageKeyError("minimal satu segmen setelah domain");
  }

  for (const segment of segments) assertSegment(segment);
  const key = [domain, ...segments].join("/");
  if (key.length > 1_024) throw new InvalidStorageKeyError("panjang key maksimal 1024 karakter");
  return key;
}

/** Validasi ulang key pada batas adapter, termasuk key yang tidak dibuat helper. */
export function assertStorageKey(key: string): void {
  const segments = key.split("/");
  const [domain, ...rest] = segments;
  if (domain === undefined || !STORAGE_DOMAIN_SET.has(domain)) {
    throw new InvalidStorageKeyError(`domain '${domain ?? ""}' tidak dikenal`);
  }
  buildStorageKey(domain as StorageDomain, ...rest);
}

export interface ResumePdfKeyInput {
  userId: string;
  resumeId: string;
  /** SHA-256 lowercase dari konten yang dirender; fondasi idempotensi PR-063. */
  contentHash: string;
}

/** `resumes/{userId}/{resumeId}/{sha256}.pdf`. */
export function resumePdfKey(input: ResumePdfKeyInput): string {
  if (!/^[a-f0-9]{64}$/.test(input.contentHash)) {
    throw new InvalidStorageKeyError("contentHash CV harus SHA-256 lowercase (64 karakter hex)");
  }
  return buildStorageKey("resumes", input.userId, input.resumeId, `${input.contentHash}.pdf`);
}
