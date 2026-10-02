// Mesin status lamaran (PR-076) — AC "transisi ilegal ditolak, test state
// machine penuh". Seluruh 8 × 8 × 2 kombinasi (dari, ke, peran) diperiksa
// terhadap tabel yang ditulis TERPISAH dari implementasinya: menghitung
// harapan dengan rumus yang sama dengan kodenya hanya membuktikan kode sama
// dengan dirinya sendiri.
import { describe, it, expect } from "vitest";
import { applicationStatusSchema, type ApplicationStatus } from "@nawasena/schemas";
import { bolehPindah, statusAktif } from "../src/modules/applications/index.js";

const SEMUA = applicationStatusSchema.options;

/** Tujuan sah ADMIN per status asal — ditulis tangan. */
const ADMIN: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["viewed", "in_review", "interview", "offered", "hired", "rejected"],
  viewed: ["in_review", "interview", "offered", "hired", "rejected"],
  in_review: ["interview", "offered", "hired", "rejected"],
  interview: ["offered", "hired", "rejected"],
  offered: ["hired", "rejected"],
  hired: [],
  rejected: [],
  withdrawn: [],
};

/** Tujuan sah PELAMAR per status asal — hanya withdraw dari status aktif. */
const PELAMAR: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["withdrawn"],
  viewed: ["withdrawn"],
  in_review: ["withdrawn"],
  interview: ["withdrawn"],
  offered: ["withdrawn"],
  hired: [],
  rejected: [],
  withdrawn: [],
};

describe("mesin status — seluruh kombinasi", () => {
  for (const [peran, tabel] of [
    ["admin", ADMIN],
    ["seeker", PELAMAR],
  ] as const) {
    for (const dari of SEMUA) {
      it(`${peran}: dari ${dari}`, () => {
        const sah = SEMUA.filter((ke) => bolehPindah(dari, ke, peran));
        expect(sah).toEqual(tabel[dari]);
      });
    }
  }
});

describe("contoh yang dinamai AC", () => {
  it("rejected → hired ditolak untuk siapa pun", () => {
    expect(bolehPindah("rejected", "hired", "admin")).toBe(false);
    expect(bolehPindah("rejected", "hired", "seeker")).toBe(false);
  });

  it("mundur ditolak (interview → in_review)", () => {
    expect(bolehPindah("interview", "in_review", "admin")).toBe(false);
  });

  it("admin tidak bisa membatalkan atas nama pelamar", () => {
    expect(bolehPindah("submitted", "withdrawn", "admin")).toBe(false);
  });

  it("status akhir = hired, rejected, withdrawn", () => {
    expect(SEMUA.filter((s) => !statusAktif(s))).toEqual(["hired", "rejected", "withdrawn"]);
  });
});
