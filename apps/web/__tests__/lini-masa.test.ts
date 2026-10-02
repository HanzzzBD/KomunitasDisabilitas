// Mapper lini masa lamaran (PR-079, Testing Checklist "Unit Test (mapper
// timeline)"). Layarnya diuji `lamaran-saya.test.tsx`.
import { describe, expect, it } from "vitest";
import { petakanLiniMasa } from "../src/features/applications/lini-masa.js";

const DIKIRIM = "2026-09-20T03:00:00.000Z";

describe("petakanLiniMasa", () => {
  it("riwayat kosong (baru dikirim) → tetap satu titik 'dikirim', sekaligus terbaru", () => {
    expect(petakanLiniMasa({ appliedAt: DIKIRIM, statusHistory: [] })).toEqual([
      { status: null, at: DIKIRIM, oleh: null, terbaru: true },
    ]);
  });

  it("titik awal + perpindahan, kronologis, hanya yang terakhir bertanda terbaru", () => {
    const lini = petakanLiniMasa({
      appliedAt: DIKIRIM,
      statusHistory: [
        { from: "submitted", to: "viewed", by: "admin", at: "2026-09-22T03:00:00.000Z" },
        { from: "viewed", to: "withdrawn", by: "seeker", at: "2026-09-23T03:00:00.000Z" },
      ],
    });
    expect(lini.map((e) => [e.status, e.oleh, e.terbaru])).toEqual([
      [null, null, false],
      ["viewed", "admin", false],
      ["withdrawn", "seeker", true],
    ]);
  });

  it("urutan dari server tidak dipercaya buta: diurutkan ulang menurut waktu", () => {
    const lini = petakanLiniMasa({
      appliedAt: DIKIRIM,
      statusHistory: [
        { from: "interview", to: "offered", by: "admin", at: "2026-09-30T03:00:00.000Z" },
        { from: "submitted", to: "interview", by: "admin", at: "2026-09-25T03:00:00.000Z" },
      ],
    });
    expect(lini.map((e) => e.status)).toEqual([null, "interview", "offered"]);
  });

  it("waktu kembar mempertahankan urutan aslinya (stabil)", () => {
    const at = "2026-09-30T03:00:00.000Z";
    const lini = petakanLiniMasa({
      appliedAt: DIKIRIM,
      statusHistory: [
        { from: "offered", to: "hired", by: "seeker", at },
        { from: "hired", to: "hired", by: "seeker", at },
      ],
    });
    expect(lini.map((e) => e.status)).toEqual([null, "hired", "hired"]);
    expect(lini[2]?.terbaru).toBe(true);
  });
});
