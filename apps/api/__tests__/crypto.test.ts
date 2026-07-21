import { describe, it, expect } from "vitest";
import {
  parseFieldKeys,
  createFieldCrypto,
  isEncryptedField,
  FieldKeyError,
  DekripsiError,
  type FieldKeys,
} from "../src/core/crypto/index.js";

// Kunci dev-only DETERMINISTIK (base64 dari 32 byte) — HANYA untuk test, tidak
// dipakai di lingkungan mana pun. Dua versi berbeda untuk uji rotasi multi-versi.
const KEY_V1 = Buffer.alloc(32, 1).toString("base64");
const KEY_V2 = Buffer.alloc(32, 2).toString("base64");

/** Bangun FieldKeys dari source env sintetis (tanpa menyentuh process.env). */
function keysFrom(source: NodeJS.ProcessEnv): FieldKeys {
  return parseFieldKeys(source);
}

describe("parseFieldKeys — validasi kunci saat boot (AC: boot gagal bila kunci salah)", () => {
  it("tanpa FIELD_KEY_V* → FieldKeyError menyebut FIELD_KEY_V1", () => {
    let caught: unknown;
    try {
      keysFrom({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FieldKeyError);
    const err = caught as FieldKeyError;
    expect(err.issues.map(([n]) => n)).toContain("FIELD_KEY_V1");
    // Pesan siap-cetak memandu pembuatan kunci + rujuk runbook.
    expect(err.message).toContain("openssl rand -base64 32");
    expect(err.message).toContain("runbook-keys.md");
  });

  it("kunci salah panjang (bukan 32 byte) → FieldKeyError", () => {
    const short = Buffer.alloc(16, 9).toString("base64");
    expect(() => keysFrom({ FIELD_KEY_V1: short })).toThrow(FieldKeyError);
  });

  it("kunci bukan base64 valid → FieldKeyError (round-trip guard)", () => {
    expect(() => keysFrom({ FIELD_KEY_V1: "bukan base64 %%%" })).toThrow(FieldKeyError);
  });

  it("versi di luar 1..255 → FieldKeyError", () => {
    expect(() => keysFrom({ FIELD_KEY_V0: KEY_V1 })).toThrow(FieldKeyError);
    expect(() => keysFrom({ FIELD_KEY_V256: KEY_V1 })).toThrow(FieldKeyError);
  });

  it("versi dengan nol di depan (V01) ditolak — mencegah alias versi ganda", () => {
    expect(() => keysFrom({ FIELD_KEY_V01: KEY_V1 })).toThrow(FieldKeyError);
  });

  it("nama env non-kunci diabaikan (tidak mengganggu scan)", () => {
    const keys = keysFrom({ FIELD_KEY_V1: KEY_V1, DATABASE_URL: "x", FIELD_KEY: "y" });
    expect(keys.activeVersion).toBe(1);
    expect(keys.keys.size).toBe(1);
  });

  it("activeVersion = versi tertinggi di antara banyak kunci", () => {
    const keys = keysFrom({ FIELD_KEY_V1: KEY_V1, FIELD_KEY_V2: KEY_V2 });
    expect(keys.activeVersion).toBe(2);
    expect(keys.keys.size).toBe(2);
  });
});

describe("encrypt/decrypt — round-trip & format biner (AC: round-trip + test vector)", () => {
  const keys = keysFrom({ FIELD_KEY_V1: KEY_V1 });
  const crypto = createFieldCrypto(keys);

  it("round-trip UTF-8 termasuk karakter non-ASCII", () => {
    const plain = "Tuli — kebutuhan: juru bahasa isyarat 🤟";
    const field = crypto.encryptField(plain);
    expect(crypto.decryptField(field)).toBe(plain);
  });

  it("format biner terkunci: [1 versi][12 iv][16 tag][n data]", () => {
    const field = crypto.encryptField("halo");
    // versi = byte pertama = activeVersion.
    expect(field[0]).toBe(1);
    expect(crypto.versionOf(field)).toBe(1);
    // panjang = 1 + 12 + 16 + len(ciphertext); ciphertext GCM = panjang plaintext.
    expect(field.length).toBe(1 + 12 + 16 + Buffer.byteLength("halo", "utf8"));
  });

  it("IV acak: dua enkripsi plaintext sama menghasilkan ciphertext berbeda", () => {
    const a = crypto.encryptField("sama");
    const b = crypto.encryptField("sama");
    expect(a.equals(b)).toBe(false);
    // tetapi keduanya balik ke plaintext yang sama.
    expect(crypto.decryptField(a)).toBe("sama");
    expect(crypto.decryptField(b)).toBe("sama");
  });

  it("encryptJson/decryptJson round-trip objek (accommodation_needs)", () => {
    const value = { juruBahasa: true, ruang: ["akses kursi roda"], catatan: null };
    const field = crypto.encryptJson(value);
    expect(crypto.decryptJson(field)).toEqual(value);
  });

  it("string kosong tetap terenkripsi & terdekripsi", () => {
    const field = crypto.encryptField("");
    expect(field.length).toBe(1 + 12 + 16); // tanpa data
    expect(crypto.decryptField(field)).toBe("");
  });

  it("isEncryptedField: mengenali buffer valid, menolak versi tak dikenal / terlalu pendek", () => {
    const field = crypto.encryptField("x");
    expect(isEncryptedField(field, keys)).toBe(true);
    expect(isEncryptedField(Buffer.alloc(5), keys)).toBe(false); // terlalu pendek
    const unknownVersion = Buffer.concat([Buffer.from([9]), field.subarray(1)]);
    expect(isEncryptedField(unknownVersion, keys)).toBe(false); // versi 9 tidak ada
    expect(isEncryptedField("bukan buffer", keys)).toBe(false);
  });
});

describe("rotasi multi-versi (AC: round-trip lintas versi kunci)", () => {
  it("data dienkripsi V1 tetap terbaca setelah V2 menjadi aktif", () => {
    // Fase lama: hanya V1.
    const cryptoV1 = createFieldCrypto(keysFrom({ FIELD_KEY_V1: KEY_V1 }));
    const lama = cryptoV1.encryptField("rahasia lama");
    expect(lama[0]).toBe(1);

    // Fase rotasi: V1 + V2, aktif = V2.
    const keysBoth = keysFrom({ FIELD_KEY_V1: KEY_V1, FIELD_KEY_V2: KEY_V2 });
    const cryptoV2 = createFieldCrypto(keysBoth);
    expect(keysBoth.activeVersion).toBe(2);

    // Enkripsi baru pakai V2; ciphertext V1 lama tetap terbaca (tanpa downtime).
    const baru = cryptoV2.encryptField("rahasia baru");
    expect(baru[0]).toBe(2);
    expect(cryptoV2.decryptField(lama)).toBe("rahasia lama");
    expect(cryptoV2.decryptField(baru)).toBe("rahasia baru");
  });

  it("versi kunci sudah di-retire → DekripsiError yang jelas (bukan crash)", () => {
    // Ciphertext dibuat dengan V1, lalu V1 di-retire (hanya V2 tersisa).
    const lama = createFieldCrypto(keysFrom({ FIELD_KEY_V1: KEY_V1 })).encryptField("x");
    const cryptoV2only = createFieldCrypto(keysFrom({ FIELD_KEY_V2: KEY_V2 }));
    expect(() => cryptoV2only.decryptField(lama)).toThrow(DekripsiError);
  });
});

describe("integritas GCM — tamper & truncation selalu DekripsiError (AC: modifikasi → error autentikasi)", () => {
  const keys = keysFrom({ FIELD_KEY_V1: KEY_V1 });
  const crypto = createFieldCrypto(keys);

  it("membalik satu bit di setiap segmen (versi/iv/tag/data) → DekripsiError", () => {
    // Offset representatif per segmen: versi(0), iv(1), tag(13), data(29).
    for (const offset of [1, 13, 29]) {
      const field = crypto.encryptField("data yang cukup panjang untuk punya byte data");
      field[offset] = (field[offset] ?? 0) ^ 0x01; // balik satu bit
      expect(() => crypto.decryptField(field)).toThrow(DekripsiError);
    }
  });

  it("byte versi diubah ke versi tak dikenal → DekripsiError (bukan data korup)", () => {
    const field = crypto.encryptField("halo");
    field[0] = 0x7f; // versi 127 tidak ada di keys
    expect(() => crypto.decryptField(field)).toThrow(DekripsiError);
  });

  it("ciphertext terpotong di berbagai titik → SELALU DekripsiError, tidak pernah plaintext", () => {
    const field = crypto.encryptField("muatan sensitif yang tidak boleh bocor saat korup");
    // Potong pada tiap panjang dari 0 s/d (len-1): apa pun titiknya harus gagal.
    for (let len = 0; len < field.length; len++) {
      const truncated = field.subarray(0, len);
      expect(() => crypto.decryptField(truncated)).toThrow(DekripsiError);
    }
    // Full-length utuh tetap berhasil (sanity: pemotongan-lah penyebabnya).
    expect(crypto.decryptField(field)).toBe("muatan sensitif yang tidak boleh bocor saat korup");
  });

  it("byte data ekstra ditambahkan (append) → DekripsiError", () => {
    const field = crypto.encryptField("halo");
    const tampered = Buffer.concat([field, Buffer.from([0x00])]);
    expect(() => crypto.decryptField(tampered)).toThrow(DekripsiError);
  });

  it("pesan DekripsiError tidak membocorkan ciphertext maupun material kunci", () => {
    const field = crypto.encryptField("rahasia");
    field[20] = (field[20] ?? 0) ^ 0xff;
    try {
      crypto.decryptField(field);
      expect.unreachable("seharusnya melempar");
    } catch (err) {
      expect(err).toBeInstanceOf(DekripsiError);
      const msg = (err as DekripsiError).message;
      expect(msg).not.toContain(KEY_V1);
      expect(msg).not.toContain(field.toString("base64"));
      expect(msg).not.toContain(field.toString("hex"));
    }
  });
});

describe("createFieldCrypto — guard versi aktif", () => {
  it("versionOf menolak buffer terlalu pendek", () => {
    const crypto = createFieldCrypto(keysFrom({ FIELD_KEY_V1: KEY_V1 }));
    expect(() => crypto.versionOf(Buffer.alloc(3))).toThrow(DekripsiError);
  });
});
