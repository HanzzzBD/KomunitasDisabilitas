import { describe, it, expect, expectTypeOf } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCESSIBILITY_DEFAULTS,
  accessibilityResponseSchema,
  errorEnvelopeSchema,
  paginationQuerySchema,
  pdpPurgeJobSchema,
  requestOtpSchema,
  type RequestOtp,
} from "../src/index.js";
import { renderOpenApiJson, buildOpenApiDocument } from "../src/openapi.js";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("contoh skema end-to-end (requestOtpSchema)", () => {
  it("menerima input valid (runtime)", () => {
    const parsed = requestOtpSchema.parse({ phone: "+6281234567890" });
    expect(parsed.phone).toBe("+6281234567890");
  });

  it("tipe TS ter-infer dari skema yang sama (type)", () => {
    expectTypeOf<RequestOtp>().toEqualTypeOf<{ phone: string }>();
  });

  it("menolak nomor non-+62 dengan pesan Bahasa Indonesia", () => {
    const res = requestOtpSchema.safeParse({ phone: "081234567890" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/\+62/);
    }
  });
});

describe("skema fondasi (common)", () => {
  it("error envelope valid: {code, message, hint?}", () => {
    expect(
      errorEnvelopeSchema.parse({
        code: "VALIDATION_ERROR",
        message: "Input tidak valid",
        hint: "Periksa format nomor HP Anda",
      }),
    ).toBeTruthy();
  });

  it("error envelope menolak code non-UPPER_SNAKE_CASE", () => {
    expect(errorEnvelopeSchema.safeParse({ code: "notValid", message: "x" }).success).toBe(false);
  });

  it("pagination: default limit 20, tolak limit > 100, coerce string angka", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(paginationQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(paginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("payload job purge PDP (PR-023)", () => {
  it("payload kosong dari cron BUKAN dry-run", () => {
    // Job terjadwal dikirim tanpa isi. Kalau default-nya `true`, purge harian
    // akan melaporkan sukses setiap hari tanpa pernah menghapus apa pun — dan
    // janji "data hilang ≤ 30 hari" berhenti ditepati tanpa satu pun gejala.
    expect(pdpPurgeJobSchema.parse({}).dryRun).toBe(false);
    expect(pdpPurgeJobSchema.parse({ dryRun: true }).dryRun).toBe(true);
  });
});

describe("amplop respons preferensi aksesibilitas (PR-035)", () => {
  it("menerima bentuk yang BENAR-BENAR dijawab server: `{ data }`", () => {
    // Bentuk acuannya diambil dari controller PR-034
    // (`res.status(200).json({ data: await service.getMe(...) })`), bukan dari
    // fixture yang ditulis tangan — fixture bebas ikut salah bersama skemanya.
    const parsed = accessibilityResponseSchema.parse({ data: ACCESSIBILITY_DEFAULTS });
    expect(parsed.data.textScale).toBe(100);
    expect(parsed.data.screenReaderHint).toBe(false);
  });

  it("MENOLAK preferensi telanjang tanpa amplop", () => {
    // Inilah yang membuktikan pembungkusnya bekerja. Skema yang menerima kedua
    // bentuk tidak menjaga apa pun — dan bila ia diam-diam salah, setiap
    // panggilan yang BERHASIL di produksi berakhir `RESPONS_TIDAK_DIKENAL`.
    expect(accessibilityResponseSchema.safeParse(ACCESSIBILITY_DEFAULTS).success).toBe(false);
  });

  it("menolak amplop yang isinya tidak lengkap", () => {
    const { screenReaderHint: _buang, ...kurang } = ACCESSIBILITY_DEFAULTS;
    expect(accessibilityResponseSchema.safeParse({ data: kurang }).success).toBe(false);
  });
});

describe("generator OpenAPI", () => {
  it("deterministik: dua kali generate menghasilkan byte identik", () => {
    expect(renderOpenApiJson()).toBe(renderOpenApiJson());
  });

  it("openapi.json ter-commit sinkron dengan skema (guard drift)", () => {
    const committed = readFileSync(resolve(pkgDir, "openapi.json"), "utf8");
    expect(committed).toBe(renderOpenApiJson());
  });

  it("dokumen memuat path contoh + components hasil ref", () => {
    const doc = buildOpenApiDocument();
    expect(Object.keys(doc.paths ?? {})).toContain("/auth/otp/request");
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(
      expect.arrayContaining(["RequestOtp", "RequestOtpResponse", "ErrorEnvelope"]),
    );
  });
});
