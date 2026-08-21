// Konfigurasi ketiga sub-entitas karier (PR-040).
//
// SEBAGAI DATA, bukan sebagai tiga komponen. Yang berbeda di antara pengalaman
// kerja, pendidikan, dan keahlian hanyalah daftar kolomnya dan cara satu baris
// diringkas menjadi satu kalimat; seluruh perilakunya — memuat, menambah,
// mengubah, menghapus, mengumumkan — identik dan tinggal di `DaftarKarier`.
//
// Bentuk ini juga yang membuat kolom baru menjadi satu baris di tabel, bukan
// satu penyuntingan di tiga tempat yang salah satunya akan terlewat.
import {
  createEducationSchema,
  createExperienceSchema,
  createSkillSchema,
  type Education,
  type Experience,
  type Skill,
} from "@nawasena/schemas";
import { educationsApi, experiencesApi, profilesKeys, skillsApi } from "@nawasena/api-client";
import {
  angkaAtauNull,
  gabungKeterangan,
  teksAtauNull,
  type KonfigKarier,
} from "./daftar-karier.js";

/**
 * Ketiganya dirakit lewat fungsi, bukan konstanta modul, karena kunci cache-nya
 * dilingkupi `sub` — dan `sub` baru diketahui setelah sesi dipulihkan.
 */
export function konfigPengalaman(sub: string | null): KonfigKarier<Experience> {
  return {
    judul: "profil.pengalaman.judul",
    satuan: "profil.pengalaman.satuan",
    kosong: "profil.pengalaman.kosong",
    skemaBuat: createExperienceSchema,
    api: experiencesApi,
    kunciQuery: profilesKeys.experiences(sub),
    kolom: [
      { nama: "title", label: "profil.pengalaman.title", jenis: "teks", maks: 120, wajib: true },
      { nama: "company", label: "profil.pengalaman.company", jenis: "teks", maks: 120 },
      {
        nama: "startDate",
        label: "profil.pengalaman.startDate",
        bantuan: "profil.karier.tanggalBantuan",
        jenis: "tanggal",
      },
      {
        nama: "endDate",
        label: "profil.pengalaman.endDate",
        bantuan: "profil.pengalaman.endDateBantuan",
        jenis: "tanggal",
      },
      {
        nama: "description",
        label: "profil.pengalaman.description",
        jenis: "area",
        maks: 2000,
      },
    ],
    keNilai: (item) => ({
      title: item.title,
      company: item.company ?? "",
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? "",
      description: item.description ?? "",
    }),
    keBadan: (nilai) => ({
      title: (nilai.title ?? "").trim(),
      company: teksAtauNull(nilai.company),
      startDate: teksAtauNull(nilai.startDate),
      endDate: teksAtauNull(nilai.endDate),
      description: teksAtauNull(nilai.description),
    }),
    judulItem: (item) => item.title,
    ringkas: (item) =>
      gabungKeterangan(item.company, gabungRentang(item.startDate, item.endDate)),
    idItem: (item) => item.id,
  };
}

/**
 * "2020-01-01 – 2022-05-01", atau hanya salah satunya bila yang lain kosong.
 *
 * Tanggal ditampilkan APA ADANYA, bukan diformat menjadi "Januari 2020". Yang
 * tampil di daftar harus sama persis dengan yang muncul di kolom saat pengguna
 * menekan Ubah — dua bentuk untuk satu nilai membuat orang mengira ia salah
 * mengetik sesuatu.
 */
function gabungRentang(mulai: string | null, selesai: string | null): string | null {
  if (mulai === null && selesai === null) return null;
  if (selesai === null) return mulai;
  if (mulai === null) return selesai;
  return `${mulai} – ${selesai}`;
}

export function konfigPendidikan(sub: string | null): KonfigKarier<Education> {
  return {
    judul: "profil.pendidikan.judul",
    satuan: "profil.pendidikan.satuan",
    kosong: "profil.pendidikan.kosong",
    skemaBuat: createEducationSchema,
    api: educationsApi,
    kunciQuery: profilesKeys.educations(sub),
    kolom: [
      {
        nama: "institution",
        label: "profil.pendidikan.institution",
        jenis: "teks",
        maks: 160,
        wajib: true,
      },
      {
        nama: "degree",
        label: "profil.pendidikan.degree",
        bantuan: "profil.pendidikan.degreeBantuan",
        jenis: "teks",
        maks: 120,
      },
      { nama: "field", label: "profil.pendidikan.field", jenis: "teks", maks: 120 },
      {
        nama: "year",
        label: "profil.pendidikan.year",
        bantuan: "profil.pendidikan.yearBantuan",
        jenis: "angka",
        maks: 4,
      },
    ],
    keNilai: (item) => ({
      institution: item.institution,
      degree: item.degree ?? "",
      field: item.field ?? "",
      year: item.year === null ? "" : String(item.year),
    }),
    keBadan: (nilai) => ({
      institution: (nilai.institution ?? "").trim(),
      degree: teksAtauNull(nilai.degree),
      field: teksAtauNull(nilai.field),
      year: angkaAtauNull(nilai.year),
    }),
    judulItem: (item) => item.institution,
    ringkas: (item) =>
      gabungKeterangan(item.degree, item.field, item.year === null ? null : String(item.year)),
    idItem: (item) => item.id,
  };
}

export function konfigKeahlian(sub: string | null): KonfigKarier<Skill> {
  return {
    judul: "profil.keahlian.judul",
    satuan: "profil.keahlian.satuan",
    kosong: "profil.keahlian.kosong",
    skemaBuat: createSkillSchema,
    api: skillsApi,
    kunciQuery: profilesKeys.skills(sub),
    kolom: [
      { nama: "name", label: "profil.keahlian.name", jenis: "teks", maks: 80, wajib: true },
      {
        nama: "level",
        label: "profil.keahlian.level",
        bantuan: "profil.keahlian.levelBantuan",
        jenis: "teks",
        maks: 40,
      },
    ],
    keNilai: (item) => ({ name: item.name, level: item.level ?? "" }),
    keBadan: (nilai) => ({
      name: (nilai.name ?? "").trim(),
      level: teksAtauNull(nilai.level),
    }),
    judulItem: (item) => item.name,
    ringkas: (item) => item.level,
    idItem: (item) => item.id,
  };
}
