// @nawasena/formulir (PR-092). Perilaku web yang lebih rinci tetap dijaga test
// apps/web (lewat ekspor ulang); di sini kontrak paketnya sendiri.
import {
  resumeContentInputSchema,
  SEEKER_PROFILE_KOSONG,
  updateSeekerProfileSchema,
  type SeekerProfile,
} from "@nawasena/schemas";
import { describe, expect, it } from "vitest";

import {
  alihkan,
  angkaAtauNull,
  BADAN_CABUT,
  baca,
  buatKolomPengalaman,
  buatKolomSertifikat,
  buatKolomTautan,
  buatPrefillResume,
  gabungKeterangan,
  hapusItem,
  keBadanDasar,
  keBadanSensitif,
  keNilaiDasar,
  keNilaiSensitif,
  KUNCI_LABEL_RESUME,
  periksa,
  pindahItem,
  SENSITIF_KOSONG,
  teksAtauNull,
  teksMentahAtauNull,
  ubahItem,
} from "../src/index.js";

const BERIZIN: SeekerProfile = {
  ...SEEKER_PROFILE_KOSONG,
  consentSensitiveAt: "2026-10-01T00:00:00.000Z",
  sensitive: {
    disabilityTypes: ["netra"],
    accommodationNeeds: { tags: ["ramah_screen_reader"], notes: "Butuh dokumen digital" },
  },
};

describe("teks", () => {
  it("teksAtauNull merapikan; teksMentahAtauNull mempertahankan spasi yang sedang diketik", () => {
    expect(teksAtauNull("  Jakarta  ")).toBe("Jakarta");
    expect(teksAtauNull("   ")).toBeNull();
    expect(teksAtauNull(undefined)).toBeNull();
    expect(teksMentahAtauNull("Jakarta ")).toBe("Jakarta ");
    expect(teksMentahAtauNull("  ")).toBeNull();
  });

  it("angka, baca, gabungKeterangan", () => {
    expect(angkaAtauNull(" 2020 ")).toBe(2020);
    expect(angkaAtauNull("")).toBeNull();
    expect(Number.isNaN(angkaAtauNull("dua ribu"))).toBe(true);
    expect(baca(null)).toBe("");
    expect(baca(2020)).toBe("2020");
    expect(gabungKeterangan("PT A", null, "", "2020")).toBe("PT A · 2020");
    expect(gabungKeterangan(null)).toBeNull();
  });
});

describe("profil", () => {
  it("dasar: roundtrip profil → formulir → badan yang lolos skema PUT", () => {
    const nilai = keNilaiDasar({ ...SEEKER_PROFILE_KOSONG, headline: "Penulis" });
    expect(nilai.headline).toBe("Penulis");
    expect(nilai.city).toBe("");
    expect(updateSeekerProfileSchema.safeParse(keBadanDasar(nilai)).success).toBe(true);
  });

  it("sensitif: tanpa consent → formulir kosong dengan kotak TIDAK tercentang", () => {
    expect(keNilaiSensitif(SEEKER_PROFILE_KOSONG)).toEqual(SENSITIF_KOSONG);
    expect(SENSITIF_KOSONG.setuju).toBe(false);
  });

  it("sensitif: consent dikirim HANYA bila belum berlaku", () => {
    const nilai = keNilaiSensitif(BERIZIN);
    expect(nilai).toMatchObject({ setuju: true, ragam: ["netra"] });
    expect(keBadanSensitif(nilai, true)).not.toHaveProperty("consentSensitive");
    expect(keBadanSensitif({ ...nilai }, false)).toMatchObject({ consentSensitive: true });
    expect(updateSeekerProfileSchema.safeParse(keBadanSensitif(nilai, false)).success).toBe(true);
  });

  it("cabut consent tidak membawa data sensitif apa pun", () => {
    expect(BADAN_CABUT).toEqual({ consentSensitive: false });
    expect(updateSeekerProfileSchema.safeParse(BADAN_CABUT).success).toBe(true);
  });

  it("alihkan pilihan ganda", () => {
    expect(alihkan(["tuli"], "netra", true)).toEqual(["tuli", "netra"]);
    expect(alihkan(["tuli", "netra"], "tuli", false)).toEqual(["netra"]);
  });
});

describe("daftar", () => {
  it("pindahItem menukar posisi dan melaporkan tujuannya; di batas → null", () => {
    expect(pindahItem(["a", "b", "c"], 1, -1)).toEqual({ daftar: ["b", "a", "c"], ke: 0 });
    expect(pindahItem(["a", "b", "c"], 1, 1)).toEqual({ daftar: ["a", "c", "b"], ke: 2 });
    expect(pindahItem(["a", "b"], 0, -1)).toBeNull();
    expect(pindahItem(["a", "b"], 1, 1)).toBeNull();
  });

  it("ubah & hapus tidak memutasi aslinya", () => {
    const asli = ["a", "b", "c"] as const;
    expect(ubahItem(asli, 1, "B")).toEqual(["a", "B", "c"]);
    expect(hapusItem(asli, 0)).toEqual(["b", "c"]);
    expect(asli).toEqual(["a", "b", "c"]);
  });
});

describe("resume", () => {
  const label = (k: string) => `[${k}]`;

  it("kolom memakai fungsi label pemanggil; kunci terdaftar", () => {
    const kolom = buatKolomPengalaman(label);
    expect(kolom[0]).toMatchObject({ nama: "title", label: "[resume.kolom.posisi]", wajib: true });
    for (const k of kolom) {
      expect(KUNCI_LABEL_RESUME).toContain(k.label.slice(1, -1));
    }
  });

  it("tulis/baca: kolom teks mempertahankan spasi ketikan, kolom tahun jadi angka", () => {
    const [, perusahaan] = buatKolomPengalaman(label);
    const item = { title: "X", company: null, startDate: null, endDate: null, description: null };
    expect(perusahaan?.tulis(item, "PT Maju ").company).toBe("PT Maju ");
    const tahun = buatKolomSertifikat(label).find((k) => k.nama === "year");
    expect(tahun?.tulis({ name: "A", issuer: null, year: null }, "2024").year).toBe(2024);
    expect(buatKolomTautan(label).map((k) => k.nama)).toEqual(["label", "url"]);
  });

  it("prefill: salinan profil tanpa id, tanpa data disabilitas, lolos skema isi CV", () => {
    const isi = buatPrefillResume({
      akun: { email: "rina@contoh.id", phone: "+6281234567890" } as never,
      profil: { ...BERIZIN, headline: "Desainer", city: "Bandung" },
      pengalaman: [
        {
          id: "01912345-89ab-7def-8123-000000000001",
          title: "Desainer",
          company: "PT A",
          startDate: "2020-01-01",
          endDate: null,
          description: null,
        },
      ],
      pendidikan: [],
      keahlian: [{ id: "01912345-89ab-7def-8123-000000000002", name: "Figma", level: null }],
    });
    expect(isi.contact).toMatchObject({ email: "rina@contoh.id", city: "Bandung" });
    expect(isi.experiences[0]).not.toHaveProperty("id");
    expect(JSON.stringify(isi)).not.toContain("netra");
    expect(resumeContentInputSchema.safeParse(isi).success).toBe(true);
  });

  it("periksa: galat per kolom memakai path bertitik", () => {
    const hasil = periksa(updateSeekerProfileSchema, {
      accommodationNeeds: { tags: [], notes: "x".repeat(501) },
    });
    expect(hasil.ok).toBe(false);
    expect(hasil.ok === false && Object.keys(hasil.galat)).toEqual(["accommodationNeeds.notes"]);
  });
});
