import { describe, expect, it } from "vitest";
import type { Education, Experience, Me, SeekerProfile, Skill } from "@nawasena/schemas";
import { buatPrefillResume } from "../src/features/resume/prefill.js";

const akun: Me = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Rina Pratiwi",
  email: "rina@contoh.id",
  phone: "+628123456789",
  role: "seeker",
  createdAt: "2026-09-25T00:00:00.000Z",
};
const profil: SeekerProfile = {
  headline: "Staf administrasi",
  summary: "Teliti dan terbiasa mengolah data.",
  city: "Bandung",
  province: "Jawa Barat",
  openToRemote: true,
  disclosureDefault: "always",
  consentSensitiveAt: "2026-09-25T00:00:00.000Z",
  sensitive: {
    disabilityTypes: ["daksa"],
    accommodationNeeds: { tags: ["akses_kursi_roda"], notes: "Rahasia" },
  },
};
const pengalaman: Experience[] = [
  {
    id: "01912345-89ab-7def-8123-4567890abc01",
    title: "Staf Admin",
    company: "PT Maju",
    startDate: "2024-01-01",
    endDate: null,
    description: "Mengolah dokumen",
  },
];
const pendidikan: Education[] = [
  {
    id: "01912345-89ab-7def-8123-4567890abc02",
    institution: "SMK Negeri 1",
    degree: "SMK",
    field: "Administrasi",
    year: 2023,
  },
];
const keahlian: Skill[] = [
  {
    id: "01912345-89ab-7def-8123-4567890abc03",
    name: "Microsoft Excel",
    level: "Mahir",
  },
];

describe("buatPrefillResume", () => {
  it("menyalin profil aman dan riwayat tanpa id database", () => {
    const hasil = buatPrefillResume({ akun, profil, pengalaman, pendidikan, keahlian });

    expect(hasil.contact).toEqual({
      email: akun.email,
      phone: akun.phone,
      city: profil.city,
      province: profil.province,
      links: [],
    });
    expect(hasil.experiences[0]).toEqual({
      title: "Staf Admin",
      company: "PT Maju",
      startDate: "2024-01-01",
      endDate: null,
      description: "Mengolah dokumen",
    });
    expect(hasil.educations[0]).not.toHaveProperty("id");
    expect(hasil.skills[0]).not.toHaveProperty("id");
  });

  it("tidak pernah menyalin data disabilitas ke CV", () => {
    const hasil = buatPrefillResume({ akun, profil, pengalaman, pendidikan, keahlian });
    const teks = JSON.stringify(hasil);
    expect(teks).not.toContain("daksa");
    expect(teks).not.toContain("akses_kursi_roda");
    expect(teks).not.toContain("Rahasia");
  });
});
