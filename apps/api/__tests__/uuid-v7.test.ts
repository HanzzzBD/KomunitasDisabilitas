import { describe, it, expect } from "vitest";
import { uuidV5, uuidV7 } from "../src/core/ids/index.js";

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidV7 (SDD §14 — PK sortable)", () => {
  it("format RFC 9562: versi 7, varian 10xx", () => {
    for (let i = 0; i < 100; i++) {
      expect(uuidV7()).toMatch(UUID_V7_RE);
    }
  });

  it("unik: 1000 id tanpa duplikat", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidV7()));
    expect(ids.size).toBe(1000);
  });

  it("sortable: timestamp naik → urutan leksikografis naik", () => {
    // Urutan DALAM ms yang sama tidak dijamin (cukup untuk kebutuhan Nawasena);
    // yang dijamin: antar-milidetik.
    const t0 = Date.parse("2026-07-18T00:00:00Z");
    const ids = Array.from({ length: 50 }, (_, i) => uuidV7(t0 + i * 10));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("timestamp ter-encode benar (48 bit pertama = ms big-endian)", () => {
    const now = 0x0123456789ab;
    const id = uuidV7(now);
    expect(id.slice(0, 8) + id.slice(9, 13)).toBe("0123456789ab");
  });
});

// --- uuidV5 (PR-047): id yang DITURUNKAN, bukan diundi -----------------------
//
// Diuji di berkas yang sama karena keduanya penghuni core/ids dan dibaca
// bersama: pertanyaan "id mana yang dipakai untuk apa" hanya terjawab bila
// jawabannya berdampingan.

const UUID_V5_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidV5 (PR-047 — idempotensi notifikasi)", () => {
  it("format RFC 9562: versi 5, varian 10xx", () => {
    expect(uuidV5("lamaran.terkirim:pengguna:peristiwa")).toMatch(UUID_V5_RE);
  });

  it("cocok dengan vektor uji RFC (namespace DNS, nama www.example.com)", () => {
    // Vektor baku RFC 9562 §A.4. Ini yang membuktikan implementasinya benar-benar
    // UUIDv5 dan bukan "hash yang kebetulan berbentuk UUID": tanpa vektor
    // eksternal, sebuah implementasi yang salah tetap konsisten dengan dirinya
    // sendiri — dan test yang hanya membandingkan dua panggilannya akan hijau.
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("deterministik: nama sama → id sama, selalu", () => {
    const sekali = uuidV5("peristiwa-yang-sama");
    for (let i = 0; i < 10; i++) expect(uuidV5("peristiwa-yang-sama")).toBe(sekali);
  });

  it("nama berbeda → id berbeda", () => {
    expect(uuidV5("a")).not.toBe(uuidV5("b"));
  });

  it("namespace yang bukan UUID ditolak", () => {
    // Namespace rusak yang diterima diam-diam berarti seluruh id turunan
    // berpindah tanpa satu pun tanda — dan penjaga idempotensi berhenti
    // mengenali baris yang sudah ada.
    expect(() => uuidV5("apa saja", "bukan-uuid")).toThrow(/Namespace UUID tidak valid/);
  });
});
