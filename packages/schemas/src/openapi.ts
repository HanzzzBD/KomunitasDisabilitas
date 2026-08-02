// Builder dokumen OpenAPI dari skema zod (zod-openapi, SDD §11).
// TIDAK diekspor dari index.ts — hanya dipakai scripts/gen-openapi.ts dan test;
// konsumen paket (web/mobile/api-client) cukup skema zod-nya.
//
// DETERMINISTIK by design: tanpa timestamp/nilai acak, versi di-pin manual,
// urutan path & skema mengikuti urutan deklarasi di file ini. Output byte-sama
// untuk input sama → diff check di CI valid.
import { createDocument, type oas31 } from "zod-openapi";
import { errorEnvelopeSchema } from "./common.js";
import { requestOtpSchema, requestOtpResponseSchema } from "./auth.js";

/** Versi kontrak API — naikkan manual saat kontrak berubah (additive-first). */
export const CONTRACT_VERSION = "0.1.0";

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorEnvelopeSchema } },
});

export function buildOpenApiDocument(): oas31.OpenAPIObject {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "Nawasena API",
      version: CONTRACT_VERSION,
      description:
        "Kontrak API Nawasena — di-generate dari zod di packages/schemas. " +
        "Jangan edit openapi.json manual; jalankan pnpm --filter @nawasena/schemas gen:openapi.",
    },
    servers: [{ url: "/api/v1" }],
    paths: {
      // Contoh end-to-end pertama (PR-004). Endpoint nyata diimplementasi PR-016.
      "/auth/otp/request": {
        post: {
          operationId: "requestOtp",
          tags: ["auth"],
          summary: "Minta kode OTP",
          security: [], // eksplisit publik: endpoint pre-auth

          description: "Mengirim kode OTP ke nomor HP via WhatsApp/SMS.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: requestOtpSchema } },
          },
          responses: {
            "202": {
              description: "OTP dikirim",
              content: { "application/json": { schema: requestOtpResponseSchema } },
            },
            "400": errorResponse("Input tidak valid"),
            "429": errorResponse("Terlalu banyak permintaan — lihat header Retry-After"),
          },
        },
      },
    },
  });
}

/** Serialisasi kanonik dokumen — satu-satunya format yang di-commit & di-diff. */
export function renderOpenApiJson(): string {
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
}
