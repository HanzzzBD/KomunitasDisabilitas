import { describe, it, expect } from "vitest";
import { uuidV7 } from "../src/core/ids/index.js";

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
