// core/crypto — enkripsi field sensitif AES-256-GCM BERVERSI (ADR-007).
//
// SATU-SATUNYA pintu enkripsi/dekripsi field (disability_types,
// accommodation_needs, dst.). Dilarang crypto ad-hoc di modul lain.
//
// Format biner bytea (JANGAN diubah — data tersimpan bergantung padanya;
// dikunci test vector beku):
//   [1 byte versi][12 byte IV][16 byte auth tag][n byte ciphertext]
//
// Kunci: env FIELD_KEY_V1..Vn (base64, tepat 32 byte). Encrypt SELALU versi
// tertinggi; decrypt membaca byte versi → kunci lama tetap terbaca (rotasi
// tanpa downtime; runbook: docs/runbook-keys.md).
//
// Modul ini TIDAK pernah menyentuh logger — material kunci/plaintext tidak
// boleh berisiko ter-log (redaction adalah lapisan kedua, bukan satu-satunya).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION_BYTES = 1;
const IV_BYTES = 12; // 96-bit nonce — rekomendasi GCM
const TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256
const MIN_FIELD_BYTES = VERSION_BYTES + IV_BYTES + TAG_BYTES;

declare const encryptedFieldBrand: unique symbol;
/** Ciphertext ber-format `versi‖iv‖tag‖data` — simpan apa adanya ke bytea. */
export type EncryptedField = Buffer & { readonly [encryptedFieldBrand]: true };

/** Kunci salah panjang/format — dilempar saat BOOT (fail-fast, pola EnvError). */
export class FieldKeyError extends Error {
  readonly issues: ReadonlyArray<readonly [variable: string, reason: string]>;

  constructor(issues: ReadonlyArray<readonly [string, string]>) {
    const daftar = issues.map(([nama, alasan]) => `  - ${nama}: ${alasan}`).join("\n");
    super(
      `Kunci enkripsi field tidak valid:\n${daftar}\nBuat kunci baru: openssl rand -base64 32 (lihat docs/runbook-keys.md).`,
    );
    this.name = "FieldKeyError";
    this.issues = issues;
  }
}

/** Dekripsi gagal: versi tak dikenal / ciphertext dimanipulasi (auth GCM). */
export class DekripsiError extends Error {
  constructor(reason: string) {
    // Pesan TIDAK memuat ciphertext/material kunci.
    super(`Gagal mendekripsi data terenkripsi: ${reason}`);
    this.name = "DekripsiError";
  }
}

export interface FieldKeys {
  /** versi → kunci 32 byte */
  keys: ReadonlyMap<number, Buffer>;
  /** Versi tertinggi — dipakai semua enkripsi baru. */
  activeVersion: number;
}

const KEY_ENV_RE = /^FIELD_KEY_V(\d+)$/;

/**
 * Scan env FIELD_KEY_V1..Vn → validasi base64 + panjang 32 byte.
 * Minimal satu kunci wajib ada (core/config sengaja TIDAK memvalidasi ini —
 * kepemilikan validasi kunci di modul ini); versi harus 1..255 (muat 1 byte
 * format) dan kanonik (V1, bukan V01 — mencegah dua nama menunjuk versi sama).
 */
export function parseFieldKeys(source: NodeJS.ProcessEnv = process.env): FieldKeys {
  const issues: Array<readonly [string, string]> = [];
  const keys = new Map<number, Buffer>();

  for (const [name, raw] of Object.entries(source)) {
    const match = KEY_ENV_RE.exec(name);
    if (match === null || raw === undefined) continue;
    const version = Number(match[1]);
    if (version < 1 || version > 255 || match[1] !== String(version)) {
      issues.push([name, "versi harus 1..255 tanpa nol di depan (disimpan sebagai 1 byte)"]);
      continue;
    }
    const key = Buffer.from(raw, "base64");
    // Round-trip guard: base64 rusak menghasilkan buffer yang tidak balik sama.
    if (key.length !== KEY_BYTES || key.toString("base64") !== raw.trim()) {
      issues.push([name, `harus base64 valid dari kunci tepat ${KEY_BYTES} byte (openssl rand -base64 32)`]);
      continue;
    }
    keys.set(version, key);
  }

  if (keys.size === 0 && issues.length === 0) {
    issues.push(["FIELD_KEY_V1", "wajib diisi (kunci enkripsi data sensitif, base64 32 byte)"]);
  }
  if (issues.length > 0) throw new FieldKeyError(issues);

  return { keys, activeVersion: Math.max(...keys.keys()) };
}

/** Guard bentuk: panjang minimum + byte versi dikenal oleh keys aktif. */
export function isEncryptedField(value: unknown, fieldKeys: FieldKeys): value is EncryptedField {
  return (
    Buffer.isBuffer(value) && value.length >= MIN_FIELD_BYTES && fieldKeys.keys.has(value[0] ?? 0)
  );
}

export interface FieldCrypto {
  encryptField(plaintext: string): EncryptedField;
  decryptField(field: Buffer): string;
  /** Untuk kolom jsonb-like (accommodation_needs): serialisasi JSON kanonik. */
  encryptJson(value: unknown): EncryptedField;
  decryptJson<T = unknown>(field: Buffer): T;
  /** Versi pada sebuah ciphertext (untuk job re-encrypt & monitoring rotasi). */
  versionOf(field: Buffer): number;
}

export function createFieldCrypto(fieldKeys: FieldKeys): FieldCrypto {
  const { keys, activeVersion } = fieldKeys;
  const activeKey = keys.get(activeVersion);
  if (activeKey === undefined) throw new FieldKeyError([["FIELD_KEY", "versi aktif tidak ditemukan"]]);

  function encryptField(plaintext: string): EncryptedField {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", activeKey as Buffer, iv);
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from([activeVersion]), iv, tag, data]) as EncryptedField;
  }

  function decryptField(field: Buffer): string {
    if (!Buffer.isBuffer(field) || field.length < MIN_FIELD_BYTES) {
      throw new DekripsiError("format tidak dikenal (terlalu pendek)");
    }
    const version = field[0] ?? 0;
    const key = keys.get(version);
    if (key === undefined) {
      throw new DekripsiError(
        `versi kunci ${version} tidak tersedia — kunci lama sudah di-retire? (runbook-keys.md)`,
      );
    }
    const iv = field.subarray(VERSION_BYTES, VERSION_BYTES + IV_BYTES);
    const tag = field.subarray(VERSION_BYTES + IV_BYTES, MIN_FIELD_BYTES);
    const data = field.subarray(MIN_FIELD_BYTES);
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      // GCM auth gagal = ciphertext dimanipulasi / kunci salah — JANGAN
      // kembalikan data korup; jangan bocorkan detail crypto ke pesan.
      throw new DekripsiError("autentikasi gagal — data berubah atau kunci tidak cocok");
    }
  }

  return {
    encryptField,
    decryptField,
    encryptJson: (value) => encryptField(JSON.stringify(value)),
    decryptJson: <T>(field: Buffer) => JSON.parse(decryptField(field)) as T,
    versionOf: (field) => {
      if (!Buffer.isBuffer(field) || field.length < MIN_FIELD_BYTES) {
        throw new DekripsiError("format tidak dikenal (terlalu pendek)");
      }
      return field[0] ?? 0;
    },
  };
}
