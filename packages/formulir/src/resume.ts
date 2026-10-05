// Isi CV (PR-092; dipindah dari apps/web `features/resume`, PR-061): prefill
// dari profil dan definisi kolom tiap jenis item.
//
// Kolom didefinisikan SEKALI untuk web dan mobile. Labelnya datang dari
// pemanggil lewat `LabelResume`: web memberi `t` (katalog i18n, termasuk varian
// `id-simple`), mobile memberi teks sederhana (U-37). Nama kunci adalah kunci
// katalog web, jadi `typecheck` web menolak kunci yang tidak ada di katalog.
import {
  resumeContentInputSchema,
  type Education,
  type Experience,
  type Me,
  type ResumeCertification,
  type ResumeContent,
  type ResumeEducation,
  type ResumeExperience,
  type ResumeLink,
  type ResumeOrganization,
  type ResumeSkill,
  type SeekerProfile,
  type Skill,
} from "@nawasena/schemas";

import { angkaAtauNull, baca, teksMentahAtauNull } from "./teks.js";

/** Satu kolom formulir item CV — data, tanpa komponen. */
export interface KolomItem<T> {
  nama: string;
  label: string;
  jenis?: "teks" | "area" | "angka";
  maks?: number;
  wajib?: boolean;
  bantuan?: string;
  baca: (item: T) => string;
  tulis: (item: T, nilai: string) => T;
}

export const KUNCI_LABEL_RESUME = [
  "resume.bantuan.selesai",
  "resume.bantuan.tanggal",
  "resume.bantuan.tautan",
  "resume.kolom.alamatTautan",
  "resume.kolom.bidang",
  "resume.kolom.institusi",
  "resume.kolom.jenjang",
  "resume.kolom.keahlian",
  "resume.kolom.mulai",
  "resume.kolom.namaTautan",
  "resume.kolom.organisasi",
  "resume.kolom.penerbit",
  "resume.kolom.peran",
  "resume.kolom.perusahaan",
  "resume.kolom.posisi",
  "resume.kolom.selesai",
  "resume.kolom.sertifikat",
  "resume.kolom.tahun",
  "resume.kolom.tahunTerbit",
  "resume.kolom.tingkat",
  "resume.kolom.uraian",
  "resume.kolom.uraianOrganisasi",
] as const;

export type KunciLabelResume = (typeof KUNCI_LABEL_RESUME)[number];

export type LabelResume = (kunci: KunciLabelResume) => string;

export interface SumberPrefillResume {
  akun: Me;
  profil: SeekerProfile;
  pengalaman: readonly Experience[];
  pendidikan: readonly Education[];
  keahlian: readonly Skill[];
}

/**
 * CV baru diisi dari profil: SALINAN, bukan rujukan — mengubah profil sesudahnya
 * tidak mengubah CV yang sudah dikirim ke perusahaan. Tidak ada satu pun field
 * disabilitas yang ikut (`resumeContentSchema` tidak punya tempat untuknya).
 */
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

export function buatKolomPengalaman(label: LabelResume): readonly KolomItem<ResumeExperience>[] {
  return [
    {
      nama: "title",
      label: label("resume.kolom.posisi"),
      wajib: true,
      maks: 120,
      baca: (v) => v.title,
      tulis: (v, title) => ({ ...v, title }),
    },
    {
      nama: "company",
      label: label("resume.kolom.perusahaan"),
      maks: 120,
      baca: (v) => baca(v.company),
      tulis: (v, company) => ({ ...v, company: teksMentahAtauNull(company) }),
    },
    {
      nama: "startDate",
      label: label("resume.kolom.mulai"),
      bantuan: label("resume.bantuan.tanggal"),
      baca: (v) => baca(v.startDate),
      tulis: (v, startDate) => ({ ...v, startDate: teksMentahAtauNull(startDate) }),
    },
    {
      nama: "endDate",
      label: label("resume.kolom.selesai"),
      bantuan: label("resume.bantuan.selesai"),
      baca: (v) => baca(v.endDate),
      tulis: (v, endDate) => ({ ...v, endDate: teksMentahAtauNull(endDate) }),
    },
    {
      nama: "description",
      label: label("resume.kolom.uraian"),
      jenis: "area",
      maks: 2000,
      baca: (v) => baca(v.description),
      tulis: (v, description) => ({ ...v, description: teksMentahAtauNull(description) }),
    },
  ];
}

export function buatKolomPendidikan(label: LabelResume): readonly KolomItem<ResumeEducation>[] {
  return [
    {
      nama: "institution",
      label: label("resume.kolom.institusi"),
      wajib: true,
      maks: 160,
      baca: (v) => v.institution,
      tulis: (v, institution) => ({ ...v, institution }),
    },
    {
      nama: "degree",
      label: label("resume.kolom.jenjang"),
      maks: 120,
      baca: (v) => baca(v.degree),
      tulis: (v, degree) => ({ ...v, degree: teksMentahAtauNull(degree) }),
    },
    {
      nama: "field",
      label: label("resume.kolom.bidang"),
      maks: 120,
      baca: (v) => baca(v.field),
      tulis: (v, field) => ({ ...v, field: teksMentahAtauNull(field) }),
    },
    {
      nama: "year",
      label: label("resume.kolom.tahun"),
      jenis: "angka",
      baca: (v) => baca(v.year),
      tulis: (v, year) => ({ ...v, year: angkaAtauNull(year) }),
    },
  ];
}

export function buatKolomKeahlian(label: LabelResume): readonly KolomItem<ResumeSkill>[] {
  return [
    {
      nama: "name",
      label: label("resume.kolom.keahlian"),
      wajib: true,
      maks: 80,
      baca: (v) => v.name,
      tulis: (v, name) => ({ ...v, name }),
    },
    {
      nama: "level",
      label: label("resume.kolom.tingkat"),
      maks: 40,
      baca: (v) => baca(v.level),
      tulis: (v, level) => ({ ...v, level: teksMentahAtauNull(level) }),
    },
  ];
}

export function buatKolomSertifikat(label: LabelResume): readonly KolomItem<ResumeCertification>[] {
  return [
    {
      nama: "name",
      label: label("resume.kolom.sertifikat"),
      wajib: true,
      maks: 160,
      baca: (v) => v.name,
      tulis: (v, name) => ({ ...v, name }),
    },
    {
      nama: "issuer",
      label: label("resume.kolom.penerbit"),
      maks: 160,
      baca: (v) => baca(v.issuer),
      tulis: (v, issuer) => ({ ...v, issuer: teksMentahAtauNull(issuer) }),
    },
    {
      nama: "year",
      label: label("resume.kolom.tahunTerbit"),
      jenis: "angka",
      baca: (v) => baca(v.year),
      tulis: (v, year) => ({ ...v, year: angkaAtauNull(year) }),
    },
  ];
}

export function buatKolomOrganisasi(label: LabelResume): readonly KolomItem<ResumeOrganization>[] {
  return [
    {
      nama: "name",
      label: label("resume.kolom.organisasi"),
      wajib: true,
      maks: 160,
      baca: (v) => v.name,
      tulis: (v, name) => ({ ...v, name }),
    },
    {
      nama: "role",
      label: label("resume.kolom.peran"),
      maks: 120,
      baca: (v) => baca(v.role),
      tulis: (v, role) => ({ ...v, role: teksMentahAtauNull(role) }),
    },
    {
      nama: "startDate",
      label: label("resume.kolom.mulai"),
      bantuan: label("resume.bantuan.tanggal"),
      baca: (v) => baca(v.startDate),
      tulis: (v, startDate) => ({ ...v, startDate: teksMentahAtauNull(startDate) }),
    },
    {
      nama: "endDate",
      label: label("resume.kolom.selesai"),
      bantuan: label("resume.bantuan.selesai"),
      baca: (v) => baca(v.endDate),
      tulis: (v, endDate) => ({ ...v, endDate: teksMentahAtauNull(endDate) }),
    },
    {
      nama: "description",
      label: label("resume.kolom.uraianOrganisasi"),
      jenis: "area",
      maks: 1000,
      baca: (v) => baca(v.description),
      tulis: (v, description) => ({ ...v, description: teksMentahAtauNull(description) }),
    },
  ];
}

export function buatKolomTautan(label: LabelResume): readonly KolomItem<ResumeLink>[] {
  return [
    {
      nama: "label",
      label: label("resume.kolom.namaTautan"),
      wajib: true,
      maks: 60,
      baca: (v) => v.label,
      tulis: (v, label) => ({ ...v, label }),
    },
    {
      nama: "url",
      label: label("resume.kolom.alamatTautan"),
      wajib: true,
      maks: 300,
      bantuan: label("resume.bantuan.tautan"),
      baca: (v) => v.url,
      tulis: (v, url) => ({ ...v, url }),
    },
  ];
}
