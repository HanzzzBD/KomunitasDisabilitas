import type {
  Education,
  Experience,
  Me,
  ResumeContent,
  SeekerProfile,
  Skill,
} from "@nawasena/schemas";
import { resumeContentInputSchema } from "@nawasena/schemas";

export interface SumberPrefillResume {
  akun: Me;
  profil: SeekerProfile;
  pengalaman: readonly Experience[];
  pendidikan: readonly Education[];
  keahlian: readonly Skill[];
}

/** Membuat salinan awal CV. Data disabilitas sengaja tidak punya jalur ke hasil. */
export function buatPrefillResume(sumber: SumberPrefillResume): ResumeContent {
  return resumeContentInputSchema.parse({
    headline: sumber.profil.headline,
    summary: sumber.profil.summary,
    contact: {
      email: sumber.akun.email,
      phone: sumber.akun.phone,
      city: sumber.profil.city,
      province: sumber.profil.province,
      links: [],
    },
    experiences: sumber.pengalaman.map(({ id: _id, ...item }) => item),
    educations: sumber.pendidikan.map(({ id: _id, ...item }) => item),
    skills: sumber.keahlian.map(({ id: _id, ...item }) => item),
  });
}
