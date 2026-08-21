// Unit kontributor ekspor PDP bagian `profile` (PR-038).
//
// UTANG PR-037 YANG DIBAYAR DI SINI. Modul profil lahir tanpa bagian ekspornya
// dengan alasan tertulis: berkas yang memuat "profil" tanpa riwayat kerja,
// pendidikan, dan keahlian tampak lengkap padahal bukan. Keempat tabelnya masuk
// sekaligus sekarang, dan berkas ini yang membuktikannya masuk UTUH — termasuk
// bagian sensitif yang terdekripsi, yang justru merupakan inti hak portabilitas.
import { describe, it, expect } from "vitest";
import {
  dataExportSchema,
  EXPORT_FORMAT_VERSION,
  exportProfileSchema,
  SEEKER_PROFILE_KOSONG,
  type Education,
  type Experience,
  type SeekerProfile,
  type Skill,
} from "@nawasena/schemas";
import { createProfileExportContributor } from "../src/modules/profiles/services/profile-export.service.js";

const USER_ID = "018f4c1e-0000-7000-8000-00000000aaaa";
const LAIN = "018f4c1e-0000-7000-8000-00000000bbbb";

const EXPERIENCE: Experience = {
  id: "018f4c1e-0000-7000-8000-0000000000e1",
  title: "Analis Data",
  company: "PT Contoh",
  startDate: "2020-01-15",
  endDate: null,
  description: null,
};

const EDUCATION: Education = {
  id: "018f4c1e-0000-7000-8000-0000000000d1",
  institution: "Universitas Indonesia",
  degree: "S1",
  field: "Statistika",
  year: 2019,
};

const SKILL: Skill = {
  id: "018f4c1e-0000-7000-8000-0000000000c1",
  name: "SQL",
  level: "mahir",
};

const PROFIL_SENSITIF: SeekerProfile = {
  ...SEEKER_PROFILE_KOSONG,
  headline: "Analis data",
  city: "Yogyakarta",
  consentSensitiveAt: "2026-08-01T03:00:00.000Z",
  sensitive: {
    disabilityTypes: ["tuli"],
    accommodationNeeds: {
      tags: ["juru_bahasa_isyarat"],
      notes: "Perlu juru bahasa pada wawancara luring",
    },
  },
};

function rakit(profil: SeekerProfile = PROFIL_SENSITIF) {
  const diminta: string[] = [];
  const catat = <T>(daftar: T[]) => ({
    listFor: async (userId: string) => {
      diminta.push(userId);
      return daftar;
    },
  });

  const kontributor = createProfileExportContributor({
    profiles: {
      snapshotFor: async (userId) => {
        diminta.push(userId);
        return profil;
      },
    },
    experiences: catat([EXPERIENCE]),
    educations: catat([EDUCATION]),
    skills: catat([SKILL]),
  });

  return { kontributor, diminta };
}

describe("kontributor bagian profile", () => {
  it("mendaftar dengan nama bagian yang ada di kontrak ekspor", () => {
    const { kontributor } = rakit();

    expect(kontributor.bagian).toBe("profile");
    // Kontributor tanpa tempat di `dataExportSchema` menggagalkan permintaan
    // saat runtime (skema itu `.strict()`); menemukannya di sini jauh lebih
    // murah daripada menemukannya lewat 500 di produksi.
    expect(Object.keys(dataExportSchema.shape)).toContain(kontributor.bagian);
  });

  it("berisi profil, riwayat kerja, pendidikan, dan keahlian sekaligus", async () => {
    const { kontributor } = rakit();

    const bagian = await kontributor.kumpulkan(USER_ID);

    expect(exportProfileSchema.parse(bagian)).toMatchObject({
      headline: "Analis data",
      city: "Yogyakarta",
      experiences: [EXPERIENCE],
      educations: [EDUCATION],
      skills: [SKILL],
    });
  });

  it("data sensitif IKUT, terdekripsi — itulah inti hak portabilitas", async () => {
    const { kontributor } = rakit();

    const bagian = (await kontributor.kumpulkan(USER_ID)) as { sensitive: unknown };

    expect(bagian.sensitive).toEqual({
      disabilityTypes: ["tuli"],
      accommodationNeeds: {
        tags: ["juru_bahasa_isyarat"],
        notes: "Perlu juru bahasa pada wawancara luring",
      },
    });
  });

  it("consent yang dicabut membuat bagian sensitif null, bukan hilang", async () => {
    // Bedanya penting bagi pembaca berkas: `null` menyatakan platform memang
    // tidak sedang memegang data disabilitas orang ini. Key yang hilang hanya
    // bisa dibaca sebagai "entah".
    const { kontributor } = rakit(SEEKER_PROFILE_KOSONG);

    const bagian = await kontributor.kumpulkan(USER_ID);

    expect(bagian).toHaveProperty("sensitive", null);
    expect(exportProfileSchema.parse(bagian).consentSensitiveAt).toBeNull();
  });

  it("hanya membaca milik userId yang diminta", async () => {
    const { kontributor, diminta } = rakit();

    await kontributor.kumpulkan(USER_ID);

    // Keempat sumbernya menerima id yang SAMA. Satu saja yang tidak akan
    // membuat berkas milik seseorang memuat riwayat kerja orang lain.
    expect(diminta).toEqual([USER_ID, USER_ID, USER_ID, USER_ID]);
    expect(diminta).not.toContain(LAIN);
  });

  it("bagian yang dihasilkan lolos kontrak berkas penuh", async () => {
    const { kontributor } = rakit();

    const berkas = dataExportSchema.parse({
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: "2026-08-21T10:00:00.000Z",
      account: {
        id: USER_ID,
        fullName: "Rina Pratiwi",
        email: null,
        emailVerified: false,
        phone: "+6281234567890",
        role: "seeker",
        createdAt: "2026-08-01T03:00:00.000Z",
        authMethods: ["otp"],
      },
      profile: await kontributor.kumpulkan(USER_ID),
    });

    expect(berkas.profile.skills).toEqual([SKILL]);
  });

  it("versi format TIDAK naik — menambah bagian adalah perubahan aditif", () => {
    // Pembaca berkas lama yang mengabaikan key tak dikenal tetap bekerja. Yang
    // menaikkan versi adalah mengubah arti atau membuang field, bukan menambah.
    expect(EXPORT_FORMAT_VERSION).toBe(1);
  });
});
