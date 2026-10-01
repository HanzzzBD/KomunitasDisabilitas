// Penjelasan template deterministik (PR-073) — jalur degradasi resmi feed.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ACCOMMODATION_NEEDS, DISABILITY_TYPES } from "@nawasena/schemas";
import {
  PENJELASAN_UMUM,
  keahlianCocok,
  menyebutKondisi,
  templatePenjelasan,
  type LowonganUntukTemplate,
  type ProfilUntukTemplate,
} from "../src/modules/matching/index.js";

const lowongan = (
  o: Partial<LowonganUntukTemplate["kartu"]> = {},
  teks = "",
): LowonganUntukTemplate => ({
  kartu: {
    title: "Staf Admin",
    workMode: "onsite",
    city: "Bandung",
    province: "Jawa Barat",
    accommodations: [],
    ...o,
  },
  requirements: teks,
  description: "Mengelola arsip kantor.",
});

const profil = (o: Partial<ProfilUntukTemplate> = {}): ProfilUntukTemplate => ({
  city: null,
  province: null,
  keahlian: [],
  ...o,
});

describe("templatePenjelasan", () => {
  it("contoh dokumen phase: remote + keahlian", () => {
    expect(
      templatePenjelasan(
        profil({ keahlian: [{ name: "Excel" }] }),
        lowongan({ workMode: "remote" }, "Menguasai Microsoft Excel"),
      ),
    ).toBe("Cocok: bisa kerja dari rumah (remote), sesuai keahlian Excel.");
  });

  it("lokasi: kota sama lebih dulu, lalu provinsi sama; beda huruf diabaikan", () => {
    expect(templatePenjelasan(profil({ city: "bandung" }), lowongan())).toBe(
      "Cocok: lokasi di Bandung.",
    );
    expect(templatePenjelasan(profil({ city: "Cimahi", province: "jawa barat" }), lowongan())).toBe(
      "Cocok: lokasi di Jawa Barat.",
    );
  });

  it("fasilitas lowongan mengisi alasan kedua bila kurang", () => {
    expect(
      templatePenjelasan(
        profil(),
        lowongan({ workMode: "remote", accommodations: ["jam_kerja_fleksibel"] }),
      ),
    ).toBe("Cocok: bisa kerja dari rumah (remote), menyediakan jam kerja fleksibel.");
  });

  it("paling banyak dua alasan", () => {
    const hasil = templatePenjelasan(
      profil({ keahlian: [{ name: "Excel" }] }),
      lowongan({ workMode: "remote", accommodations: ["ruang_kerja_tenang"] }, "Excel"),
    );
    expect(hasil.split(",")).toHaveLength(2);
  });

  it("tanpa alasan konkret → kalimat umum", () => {
    expect(templatePenjelasan(profil(), lowongan({ city: null, province: null }))).toBe(
      PENJELASAN_UMUM,
    );
  });
});

describe("keahlianCocok", () => {
  it("kata utuh, tanpa beda huruf", () => {
    expect(keahlianCocok([{ name: "excel" }], lowongan({}, "Mahir EXCEL dan Word"))).toBe("excel");
    expect(keahlianCocok([{ name: "Excel" }], lowongan({}, "Excellent communication"))).toBeNull();
  });

  it("urutan profil menentukan; karakter regex di nama aman", () => {
    expect(
      keahlianCocok([{ name: "C++" }, { name: "Word" }], lowongan({}, "Pakai C++ dan Word")),
    ).toBe("C++");
  });
});

describe("AC: penjelasan tidak pernah menyebut disabilitas pengguna", () => {
  const kondisi = [...DISABILITY_TYPES, "Tuli", "tunanetra", "Autisme", "disabilitas", "difabel"];

  it("keahlian yang memuat istilah kondisi DILEWATI walau muncul di teks lowongan", () => {
    for (const k of kondisi) {
      const hasil = templatePenjelasan(
        profil({ keahlian: [{ name: k }] }),
        lowongan({ workMode: "remote" }, `Terbuka untuk ${k}`),
      );
      expect(menyebutKondisi(hasil), `${k} → ${hasil}`).toBe(false);
    }
  });

  it("PROPERTY: masukan apa pun → keluaran tanpa istilah kondisi, satu kalimat", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.constantFrom(...kondisi), fc.string({ maxLength: 20 })), {
          maxLength: 6,
        }),
        fc.constantFrom("remote", "hybrid", "onsite"),
        fc.subarray([...ACCOMMODATION_NEEDS]),
        fc.string({ maxLength: 80 }),
        (namaKeahlian, workMode, accommodations, teks) => {
          const hasil = templatePenjelasan(
            profil({ city: "Bandung", keahlian: namaKeahlian.map((name) => ({ name })) }),
            lowongan({ workMode, accommodations }, `${teks} ${namaKeahlian.join(" ")}`),
          );
          expect(menyebutKondisi(hasil)).toBe(false);
          expect(hasil).toMatch(/^Cocok[:\s].*\.$/s);
          // Tepat satu kalimat: tidak ada tanda akhir kalimat di tengah.
          expect(hasil.slice(0, -1)).not.toMatch(/[.!?]\s/);
        },
      ),
      { numRuns: 500 },
    );
  });
});
