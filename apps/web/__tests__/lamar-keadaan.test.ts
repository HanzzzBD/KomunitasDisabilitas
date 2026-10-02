// Keadaan dialog lamar (PR-078, Testing Checklist "Unit Test (state dialog)").
// Aturan yang dijaga di sini dibaca dari `features/applications/keadaan-lamar.ts`;
// perilaku layarnya di `lamar.test.tsx`.
import { describe, expect, it } from "vitest";
import { idempotencyKeySchema, type ResumeSummary, type SeekerProfile } from "@nawasena/schemas";
import {
  ISIAN_AWAL,
  cvBawaan,
  dataUntukDiungkap,
  kunciIdempotensiBaru,
  periksaIsian,
} from "../src/features/applications/keadaan-lamar.js";

const CV = "01912345-89ab-7def-8123-4567890acc01";

function ringkasan(id: string, updatedAt: string): ResumeSummary {
  return { id, title: id, pdfUrl: null, createdVia: "manual", createdAt: updatedAt, updatedAt };
}

function profil(sensitive: SeekerProfile["sensitive"]): SeekerProfile {
  return { sensitive } as SeekerProfile;
}

describe("isian awal", () => {
  it("pilihan pengungkapan TIDAK terisi — bukan 'Ya', bukan juga 'Tidak'", () => {
    expect(ISIAN_AWAL.ungkap).toBeNull();
  });
});

describe("periksaIsian", () => {
  it("tanpa pilihan pengungkapan → galat; tidak pernah dibaca sebagai 'Tidak'", () => {
    const hasil = periksaIsian({ resumeId: CV, ungkap: null }, true);
    expect(hasil).toEqual({ ok: false, galat: { ungkap: "lowongan.lamar.galat.ungkapKosong" } });
  });

  it("tanpa CV → galat CV (dan galat pengungkapan sekaligus bila belum dipilih)", () => {
    expect(periksaIsian(ISIAN_AWAL, true)).toEqual({
      ok: false,
      galat: {
        cv: "lowongan.lamar.galat.cvKosong",
        ungkap: "lowongan.lamar.galat.ungkapKosong",
      },
    });
  });

  it("'Ya' tanpa data untuk diungkap → ditolak, tidak berangkat", () => {
    expect(periksaIsian({ resumeId: CV, ungkap: "ya" }, false)).toEqual({
      ok: false,
      galat: { ungkap: "lowongan.lamar.galat.ungkapTakBisa" },
    });
  });

  it.each([
    ["ya", true],
    ["tidak", false],
  ] as const)("'%s' → discloseDisability=%s", (ungkap, harap) => {
    expect(periksaIsian({ resumeId: CV, ungkap }, true)).toEqual({
      ok: true,
      input: { resumeId: CV, discloseDisability: harap },
    });
  });

  it("'Tidak' tetap sah walau tidak ada data untuk diungkap", () => {
    expect(periksaIsian({ resumeId: CV, ungkap: "tidak" }, false).ok).toBe(true);
  });
});

describe("dataUntukDiungkap — aturan sama dengan snapshot server", () => {
  it("consent tidak ada (sensitive null) → null", () => {
    expect(dataUntukDiungkap(profil(null))).toBeNull();
    expect(dataUntukDiungkap(undefined)).toBeNull();
  });

  it("semua kosong → null", () => {
    expect(
      dataUntukDiungkap(
        profil({ disabilityTypes: [], accommodationNeeds: { tags: [], notes: null } }),
      ),
    ).toBeNull();
  });

  it.each([
    { disabilityTypes: ["netra" as const], accommodationNeeds: { tags: [], notes: null } },
    {
      disabilityTypes: [],
      accommodationNeeds: { tags: ["ruang_kerja_tenang" as const], notes: null },
    },
    { disabilityTypes: [], accommodationNeeds: { tags: [], notes: "Butuh jeda" } },
  ])("salah satu terisi → data dikembalikan apa adanya (%#)", (s) => {
    expect(dataUntukDiungkap(profil(s))).toBe(s);
  });
});

describe("cvBawaan", () => {
  it("kosong → null; selain itu CV yang paling baru disunting", () => {
    expect(cvBawaan([])).toBeNull();
    expect(
      cvBawaan([
        ringkasan("a", "2026-09-01T00:00:00.000Z"),
        ringkasan("b", "2026-09-20T00:00:00.000Z"),
        ringkasan("c", "2026-09-10T00:00:00.000Z"),
      ]),
    ).toBe("b");
  });
});

describe("kunciIdempotensiBaru", () => {
  it("lolos aturan header server dan berbeda tiap pembukaan", () => {
    const a = kunciIdempotensiBaru();
    expect(idempotencyKeySchema.safeParse(a).success).toBe(true);
    expect(kunciIdempotensiBaru()).not.toBe(a);
  });
});
