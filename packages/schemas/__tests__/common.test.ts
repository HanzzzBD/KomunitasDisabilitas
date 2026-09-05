// Skema fondasi envelope — khususnya `meta.degraded` (PR-046 AC-5).
//
// Kenapa berkas terpisah dari schemas.test.ts: yang dijaga di sini bukan satu
// skema domain, melainkan KOMPATIBILITAS envelope sukses. Setiap endpoint yang
// lahir sesudah ini mewarisi bentuk `meta`-nya, jadi pelanggarannya harus
// terbaca sebagai "envelope berubah", bukan tersembunyi di antara puluhan
// assertion skema lain.
import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import {
  degradedMetaSchema,
  paginationMetaSchema,
  successEnvelopeSchema,
  type DegradedMeta,
} from "../src/index.js";

const envelope = successEnvelopeSchema(z.object({ judul: z.string() }));
const DATA = { judul: "Analis Data" };

describe("degradedMetaSchema", () => {
  it("menerima true, false, dan tidak diisi sama sekali", () => {
    expect(degradedMetaSchema.parse({ degraded: true })).toEqual({ degraded: true });
    expect(degradedMetaSchema.parse({ degraded: false })).toEqual({ degraded: false });
    expect(degradedMetaSchema.parse({})).toEqual({});
  });

  it("menolak nilai yang bukan boolean — 'degraded' bukan pesan bebas", () => {
    expect(degradedMetaSchema.safeParse({ degraded: "true" }).success).toBe(false);
    expect(degradedMetaSchema.safeParse({ degraded: 1 }).success).toBe(false);
  });

  it("tipe TS-nya opsional (undefined = tidak degradasi)", () => {
    expectTypeOf<DegradedMeta>().toEqualTypeOf<{ degraded?: boolean | undefined }>();
  });
});

describe("successEnvelopeSchema — meta.degraded (AC-5)", () => {
  it("menerima meta.degraded true/false tanpa nextCursor", () => {
    expect(envelope.parse({ data: DATA, meta: { degraded: true } })).toEqual({
      data: DATA,
      meta: { degraded: true },
    });
    expect(envelope.parse({ data: DATA, meta: { degraded: false } })).toEqual({
      data: DATA,
      meta: { degraded: false },
    });
  });

  it("KOMPATIBEL MUNDUR: response lama tanpa `degraded` tetap sah", () => {
    // Inilah syarat 'additive, bukan breaking'. Seluruh endpoint yang sudah ada
    // hari ini tidak mengirim field ini; bila salah satu bentuk di bawah gagal,
    // PR-046 memutus kontrak yang sudah dijanjikan.
    expect(envelope.parse({ data: DATA })).toEqual({ data: DATA });
    expect(envelope.parse({ data: DATA, meta: {} })).toEqual({ data: DATA, meta: {} });
    expect(envelope.parse({ data: DATA, meta: { nextCursor: "abc" } })).toEqual({
      data: DATA,
      meta: { nextCursor: "abc" },
    });
    expect(envelope.parse({ data: DATA, meta: { nextCursor: null } })).toEqual({
      data: DATA,
      meta: { nextCursor: null },
    });
  });

  it("menerima pagination DAN degradasi sekaligus (feed AI berhalaman)", () => {
    expect(envelope.parse({ data: DATA, meta: { nextCursor: "abc", degraded: true } })).toEqual({
      data: DATA,
      meta: { nextCursor: "abc", degraded: true },
    });
  });

  it("`data` tetap wajib — degradasi bukan alasan mengirim envelope kosong", () => {
    expect(envelope.safeParse({ meta: { degraded: true } }).success).toBe(false);
  });

  it("paginationMetaSchema SENDIRI tidak ikut dilonggarkan", () => {
    // Envelope-nya `.partial()`, skema pagination-nya tidak: endpoint berhalaman
    // yang lupa mengirim nextCursor tetap bug, bukan pilihan.
    expect(paginationMetaSchema.safeParse({}).success).toBe(false);
    expect(paginationMetaSchema.safeParse({ nextCursor: null }).success).toBe(true);
  });
});
