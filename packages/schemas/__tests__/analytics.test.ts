// Kontrak analytics no-PII (PR-082, Testing Checklist "Unit Test (schema payload)").
import { describe, expect, it } from "vitest";
import { analyticsPayloadSchema, ANALYTICS_EVENTS, normalkanPath } from "../src/analytics.js";

const UUID = "01912345-89ab-7def-8123-4567890aaa40";

describe("normalkanPath", () => {
  it.each([
    [`/lamaran/${UUID}`, "/lamaran/:id"],
    [`/lowongan/${UUID}?lamar=1#x`, "/lowongan/:id"],
    ["/cv/chat?tujuan=%2Flowongan%2Fabc", "/cv/chat"],
    ["/admin/lamaran/123456", "/admin/lamaran/:id"],
    ["/", "/"],
    ["/community/karier-jakarta?kota=Jakarta", "/community/:slug"],
    ["/community/karier-jakarta/posts/123456", "/community/:slug/posts/:id"],
    ["/community", "/community"],
    ["", "/"],
  ])("%s → %s", (masuk, harap) => {
    expect(normalkanPath(masuk)).toBe(harap);
  });
});

describe("payload no-PII", () => {
  it("pageview & setiap event funnel yang sah lolos", () => {
    expect(
      analyticsPayloadSchema.safeParse({ type: "pageview", path: "/lamaran/:id" }).success,
    ).toBe(true);
    const sah = {
      daftar: { metode: "otp" },
      profil_lengkap: undefined,
      cv_dibuat: { via: "ai" },
      lamar: undefined,
      wawancara: undefined,
      hired_confirmed: undefined,
    } as const;
    for (const name of ANALYTICS_EVENTS) {
      const p = { type: "event", path: "/x", name, ...(sah[name] ? { data: sah[name] } : {}) };
      expect(analyticsPayloadSchema.safeParse(p).success, name).toBe(true);
    }
  });

  it.each([
    ["path memuat UUID", { type: "pageview", path: `/lamaran/${UUID}` }],
    ["path memuat query", { type: "pageview", path: "/cv?tujuan=x" }],
    ["path memuat topik ruang", { type: "pageview", path: "/community/karier-jakarta" }],
    ["path memuat email", { type: "pageview", path: "/u/rina@contoh.test" }],
    ["event tak dikenal", { type: "event", path: "/", name: "klik_tombol" }],
    ["data liar", { type: "event", path: "/", name: "lamar", data: { userId: UUID } }],
    ["data teks bebas", { type: "event", path: "/", name: "daftar", data: { metode: "0812345" } }],
    [
      "pengungkapan disabilitas",
      { type: "event", path: "/", name: "lamar", data: { disclose: "true" } },
    ],
    ["kolom tambahan", { type: "pageview", path: "/", title: "Rina" }],
  ])("ditolak: %s", (_n, payload) => {
    expect(analyticsPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
