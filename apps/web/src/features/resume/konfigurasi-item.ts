import type {
  ResumeCertification,
  ResumeEducation,
  ResumeExperience,
  ResumeLink,
  ResumeOrganization,
  ResumeSkill,
} from "@nawasena/schemas";
import type { FungsiTeks } from "../../shared/i18n/index.js";
import type { KolomItem } from "./daftar-item.js";

export const teksAtauNull = (nilai: string): string | null => (nilai.trim() === "" ? null : nilai);
export const angkaAtauNull = (nilai: string): number | null =>
  nilai.trim() === "" ? null : Number(nilai);
export const baca = (nilai: string | number | null): string =>
  nilai === null ? "" : String(nilai);

export function buatKolomPengalaman(t: FungsiTeks): readonly KolomItem<ResumeExperience>[] {
  return [
    {
      nama: "title",
      label: t("resume.kolom.posisi"),
      wajib: true,
      maks: 120,
      baca: (v) => v.title,
      tulis: (v, title) => ({ ...v, title }),
    },
    {
      nama: "company",
      label: t("resume.kolom.perusahaan"),
      maks: 120,
      baca: (v) => baca(v.company),
      tulis: (v, company) => ({ ...v, company: teksAtauNull(company) }),
    },
    {
      nama: "startDate",
      label: t("resume.kolom.mulai"),
      bantuan: t("resume.bantuan.tanggal"),
      baca: (v) => baca(v.startDate),
      tulis: (v, startDate) => ({ ...v, startDate: teksAtauNull(startDate) }),
    },
    {
      nama: "endDate",
      label: t("resume.kolom.selesai"),
      bantuan: t("resume.bantuan.selesai"),
      baca: (v) => baca(v.endDate),
      tulis: (v, endDate) => ({ ...v, endDate: teksAtauNull(endDate) }),
    },
    {
      nama: "description",
      label: t("resume.kolom.uraian"),
      jenis: "area",
      maks: 2000,
      baca: (v) => baca(v.description),
      tulis: (v, description) => ({ ...v, description: teksAtauNull(description) }),
    },
  ];
}

export function buatKolomPendidikan(t: FungsiTeks): readonly KolomItem<ResumeEducation>[] {
  return [
    {
      nama: "institution",
      label: t("resume.kolom.institusi"),
      wajib: true,
      maks: 160,
      baca: (v) => v.institution,
      tulis: (v, institution) => ({ ...v, institution }),
    },
    {
      nama: "degree",
      label: t("resume.kolom.jenjang"),
      maks: 120,
      baca: (v) => baca(v.degree),
      tulis: (v, degree) => ({ ...v, degree: teksAtauNull(degree) }),
    },
    {
      nama: "field",
      label: t("resume.kolom.bidang"),
      maks: 120,
      baca: (v) => baca(v.field),
      tulis: (v, field) => ({ ...v, field: teksAtauNull(field) }),
    },
    {
      nama: "year",
      label: t("resume.kolom.tahun"),
      jenis: "angka",
      baca: (v) => baca(v.year),
      tulis: (v, year) => ({ ...v, year: angkaAtauNull(year) }),
    },
  ];
}

export function buatKolomKeahlian(t: FungsiTeks): readonly KolomItem<ResumeSkill>[] {
  return [
    {
      nama: "name",
      label: t("resume.kolom.keahlian"),
      wajib: true,
      maks: 80,
      baca: (v) => v.name,
      tulis: (v, name) => ({ ...v, name }),
    },
    {
      nama: "level",
      label: t("resume.kolom.tingkat"),
      maks: 40,
      baca: (v) => baca(v.level),
      tulis: (v, level) => ({ ...v, level: teksAtauNull(level) }),
    },
  ];
}

export function buatKolomSertifikat(t: FungsiTeks): readonly KolomItem<ResumeCertification>[] {
  return [
    {
      nama: "name",
      label: t("resume.kolom.sertifikat"),
      wajib: true,
      maks: 160,
      baca: (v) => v.name,
      tulis: (v, name) => ({ ...v, name }),
    },
    {
      nama: "issuer",
      label: t("resume.kolom.penerbit"),
      maks: 160,
      baca: (v) => baca(v.issuer),
      tulis: (v, issuer) => ({ ...v, issuer: teksAtauNull(issuer) }),
    },
    {
      nama: "year",
      label: t("resume.kolom.tahunTerbit"),
      jenis: "angka",
      baca: (v) => baca(v.year),
      tulis: (v, year) => ({ ...v, year: angkaAtauNull(year) }),
    },
  ];
}

export function buatKolomOrganisasi(t: FungsiTeks): readonly KolomItem<ResumeOrganization>[] {
  return [
    {
      nama: "name",
      label: t("resume.kolom.organisasi"),
      wajib: true,
      maks: 160,
      baca: (v) => v.name,
      tulis: (v, name) => ({ ...v, name }),
    },
    {
      nama: "role",
      label: t("resume.kolom.peran"),
      maks: 120,
      baca: (v) => baca(v.role),
      tulis: (v, role) => ({ ...v, role: teksAtauNull(role) }),
    },
    {
      nama: "startDate",
      label: t("resume.kolom.mulai"),
      bantuan: t("resume.bantuan.tanggal"),
      baca: (v) => baca(v.startDate),
      tulis: (v, startDate) => ({ ...v, startDate: teksAtauNull(startDate) }),
    },
    {
      nama: "endDate",
      label: t("resume.kolom.selesai"),
      bantuan: t("resume.bantuan.selesai"),
      baca: (v) => baca(v.endDate),
      tulis: (v, endDate) => ({ ...v, endDate: teksAtauNull(endDate) }),
    },
    {
      nama: "description",
      label: t("resume.kolom.uraianOrganisasi"),
      jenis: "area",
      maks: 1000,
      baca: (v) => baca(v.description),
      tulis: (v, description) => ({ ...v, description: teksAtauNull(description) }),
    },
  ];
}

export function buatKolomTautan(t: FungsiTeks): readonly KolomItem<ResumeLink>[] {
  return [
    {
      nama: "label",
      label: t("resume.kolom.namaTautan"),
      wajib: true,
      maks: 60,
      baca: (v) => v.label,
      tulis: (v, label) => ({ ...v, label }),
    },
    {
      nama: "url",
      label: t("resume.kolom.alamatTautan"),
      wajib: true,
      maks: 300,
      bantuan: t("resume.bantuan.tautan"),
      baca: (v) => v.url,
      tulis: (v, url) => ({ ...v, url }),
    },
  ];
}
