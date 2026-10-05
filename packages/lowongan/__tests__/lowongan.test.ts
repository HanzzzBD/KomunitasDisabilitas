// @nawasena/lowongan (PR-093). Perilaku web yang lebih rinci tetap dijaga test
// apps/web (gaji.test.ts, filter-url.test.ts lewat ekspor ulang).
import { describe, expect, it } from "vitest";

import {
  dariParamPencarian,
  FILTER_KOSONG,
  jumlahFilterAktif,
  kalimatGaji,
  keOpsiPencarian,
  keParamPencarian,
  KUNCI_MODE,
  KUNCI_TINGKAT,
  KUNCI_TIPE,
  persenSkor,
  tingkatKecocokan,
  type LabelLowongan,
} from "../src/index.js";

const label: LabelLowongan = (k, v) => `${k}${v ? JSON.stringify(v) : ""}`;

describe("skor", () => {
  it("ambang tinggi 0,7 dan sedang 0,55 (inklusif)", () => {
    expect(tingkatKecocokan(0.7)).toBe("tinggi");
    expect(tingkatKecocokan(0.69)).toBe("sedang");
    expect(tingkatKecocokan(0.55)).toBe("sedang");
    expect(tingkatKecocokan(0.54)).toBe("rendah");
  });

  it("persen dibulatkan dan dijepit 0–100", () => {
    expect(persenSkor(0.7312)).toBe(73);
    expect(persenSkor(1.4)).toBe(100);
    expect(persenSkor(-0.2)).toBe(0);
  });
});

describe("gaji", () => {
  it("rentang / mulai / hingga / tanpa kalimat", () => {
    expect(kalimatGaji(label, 4_000_000, 6_000_000)).toMatch(/^lowongan\.detail\.gaji\.rentang/);
    expect(kalimatGaji(label, 4_000_000, null)).toMatch(/^lowongan\.detail\.gaji\.mulai/);
    expect(kalimatGaji(label, null, 6_000_000)).toMatch(/^lowongan\.detail\.gaji\.hingga/);
    expect(kalimatGaji(label, null, null)).toBeNull();
  });

  it("format rupiah id-ID tanpa desimal", () => {
    expect(kalimatGaji(label, 4_500_000, null)).toContain("4.500.000");
  });
});

describe("filter", () => {
  const isi = {
    query: "  admin ",
    city: " Bandung ",
    province: "",
    workMode: "remote" as const,
    accommodations: ["wawancara_via_teks", "akses_kursi_roda"] as const,
  };

  it("keOpsiPencarian merapikan, membuang kosong, mengurutkan akomodasi", () => {
    expect(keOpsiPencarian(isi)).toEqual({
      query: "admin",
      city: "Bandung",
      workMode: "remote",
      accommodations: ["akses_kursi_roda", "wawancara_via_teks"],
    });
    expect(keOpsiPencarian(FILTER_KOSONG)).toEqual({});
  });

  it("jumlah filter aktif tidak menghitung kata kunci", () => {
    expect(jumlahFilterAktif(isi)).toBe(4);
    expect(jumlahFilterAktif(FILTER_KOSONG)).toBe(0);
  });

  it("roundtrip parameter; nilai asing dari luar dibuang", () => {
    const param = keParamPencarian(isi);
    expect(dariParamPencarian(param)).toEqual({
      query: "admin",
      city: "Bandung",
      province: "",
      workMode: "remote",
      accommodations: ["akses_kursi_roda", "wawancara_via_teks"],
    });
    const asing = new URLSearchParams("workMode=planet&accommodations=jetpack");
    expect(dariParamPencarian(asing)).toEqual(FILTER_KOSONG);
  });
});

describe("kunci taksonomi", () => {
  it("lengkap untuk setiap enum", () => {
    expect(Object.keys(KUNCI_TIPE).sort()).toEqual(
      ["contract", "freelance", "full_time", "internship", "part_time"].sort(),
    );
    expect(Object.keys(KUNCI_MODE).sort()).toEqual(["hybrid", "onsite", "remote"]);
    expect(Object.keys(KUNCI_TINGKAT).sort()).toEqual(["rendah", "sedang", "tinggi"]);
  });
});
