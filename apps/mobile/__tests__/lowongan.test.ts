// Discovery mobile (PR-093): teks kartu satu kesatuan, label taksonomi, gaji.
import { KUNCI_GAJI, KUNCI_MODE, KUNCI_TINGKAT, KUNCI_TIPE } from "@nawasena/lowongan";
import type { JobSearchResult } from "@nawasena/schemas";
import { describe, expect, it } from "vitest";

import {
  labelKartu,
  labelLowongan,
  TEKS_INKLUSIF,
  teksGaji,
  teksLokasi,
  teksSkor,
} from "../src/lowongan/teks";

const JOB: JobSearchResult = {
  id: "01912345-89ab-7def-8123-000000000001",
  companyId: "01912345-89ab-7def-8123-000000000002",
  companyName: "PT Inklusi Maju",
  title: "Admin Data",
  employmentType: "full_time",
  workMode: "remote",
  city: "Bandung",
  province: "Jawa Barat",
  accommodations: [],
  publishedAt: "2026-10-01T00:00:00.000Z",
};

describe("label kartu (satu kesatuan TalkBack)", () => {
  it("hasil pencarian: judul, perusahaan, jenis, cara kerja, lokasi — satu kalimat", () => {
    expect(labelKartu(JOB)).toBe(
      "Admin Data. PT Inklusi Maju. Kerja penuh waktu. Kerja dari rumah. Bandung, Jawa Barat",
    );
  });

  it("feed: ditambah tingkat + persen (kata, bukan %) + alasan", () => {
    const label = labelKartu(JOB, { score: 0.7312, explanation: "Sesuai keahlian Excel." });
    expect(label).toContain("Sangat cocok, 73 persen");
    expect(label).toContain("Alasannya: Sesuai keahlian Excel.");
    expect(label).not.toContain("%");
  });

  it("lokasi kosong tidak meninggalkan potongan kosong", () => {
    expect(labelKartu({ ...JOB, city: null, province: null })).not.toMatch(/\.\s*$|\. \./);
    expect(teksLokasi({ city: null, province: "Jawa Barat" })).toBe("Jawa Barat");
    expect(teksLokasi({ city: "", province: null })).toBeNull();
  });
});

describe("teks", () => {
  it("setiap kunci paket punya teks mobile", () => {
    const semua = [
      ...Object.values(KUNCI_TIPE),
      ...Object.values(KUNCI_MODE),
      ...Object.values(KUNCI_TINGKAT),
      ...Object.values(KUNCI_GAJI),
    ];
    for (const k of semua) expect(labelLowongan(k, { min: "x", max: "y" })).not.toBe("");
  });

  it("skor tampil 'Cocok (60%)' — ambang dari paket bersama", () => {
    expect(teksSkor(0.6)).toBe("Cocok (60%)");
    expect(teksSkor(0.2)).toBe("Mungkin cocok (20%)");
  });

  it("gaji: variabel diganti; tanpa gaji → null", () => {
    expect(teksGaji(4_000_000, 6_000_000)).toMatch(
      /^Antara Rp.*4\.000\.000 dan Rp.*6\.000\.000 setiap bulan$/,
    );
    expect(teksGaji(null, null)).toBeNull();
  });

  it("status inklusivitas lengkap untuk tiap nilai", () => {
    for (const s of ["verified", "self_claimed", "unverified"] as const) {
      expect(TEKS_INKLUSIF[s].label).not.toBe("");
    }
  });
});
