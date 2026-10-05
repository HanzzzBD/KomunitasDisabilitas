// Tiga daftar karier profil — pengalaman, pendidikan, keahlian (PR-092; paritas
// `features/profil/karier.tsx` web, PR-040). Murni: data + pemetaan, diuji
// Vitest; layarnya generik (`KarierScreen`, `KarierFormScreen`).
//
// Tanggal adalah KOLOM TEKS YYYY-MM-DD, bukan pemilih tanggal — paritas web,
// yang menolak `<input type="date">` karena pemilih bawaan sulit bagi pembaca
// layar dan motorik terbatas. Validasi + pesannya datang dari skema yang sama
// dengan server (`periksa`).
import {
  educationsApi,
  experiencesApi,
  profilesKeys,
  skillsApi,
  type ApiClient,
} from "@nawasena/api-client";
import {
  angkaAtauNull,
  baca,
  gabungKeterangan,
  periksa,
  teksAtauNull,
  type HasilPeriksa,
} from "@nawasena/formulir";
import {
  createEducationSchema,
  createExperienceSchema,
  createSkillSchema,
  type Education,
  type Experience,
  type Skill,
} from "@nawasena/schemas";

export type JenisKarier = "pengalaman" | "pendidikan" | "keahlian";

export type NilaiBaris = Readonly<Record<string, string>>;

export interface KolomKarier {
  nama: string;
  label: string;
  wajib?: boolean;
  maks?: number;
  bantuan?: string;
  jenis?: "teks" | "area" | "angka";
}

export interface KonfigKarier<Item extends { id: string }> {
  jenis: JenisKarier;
  judul: string;
  /** Nama satu item, untuk tombol & pengumuman ("Tambah pengalaman"). */
  satuan: string;
  kosong: string;
  kolom: readonly KolomKarier[];
  kunci: (sub: string | null) => readonly unknown[];
  daftar: (k: ApiClient) => Promise<Item[]>;
  simpan: (k: ApiClient, nilai: NilaiBaris, id: string | null) => Promise<HasilPeriksa<Item>>;
  hapus: (k: ApiClient, id: string) => Promise<void>;
  keNilai: (item: Item | null) => NilaiBaris;
  ringkas: (item: Item) => { judul: string; keterangan: string | null };
}

const BANTUAN_TANGGAL = "Tulis tahun-bulan-tanggal. Contoh: 2024-03-01.";

function nilaiKosong(kolom: readonly KolomKarier[]): NilaiBaris {
  return Object.fromEntries(kolom.map((k) => [k.nama, ""]));
}

/** Periksa di klien dengan skema BUAT (bentuk penuh), lalu kirim create/update. */
async function simpanDengan<Item, Badan>(
  skema: Parameters<typeof periksa<Badan>>[0],
  badan: unknown,
  kirim: (b: Badan) => Promise<Item>,
): Promise<HasilPeriksa<Item>> {
  const hasil = periksa(skema, badan);
  if (!hasil.ok) return hasil;
  return { ok: true, nilai: await kirim(hasil.nilai) };
}

const KOLOM_PENGALAMAN: readonly KolomKarier[] = [
  { nama: "title", label: "Nama posisi", wajib: true, maks: 120 },
  { nama: "company", label: "Nama perusahaan", maks: 120 },
  { nama: "startDate", label: "Tanggal mulai", bantuan: BANTUAN_TANGGAL },
  {
    nama: "endDate",
    label: "Tanggal selesai",
    bantuan: "Kosongkan kalau masih bekerja di sini. Contoh: 2024-03-01.",
  },
  { nama: "description", label: "Uraian pekerjaan", jenis: "area", maks: 2000 },
];

export const konfigPengalaman: KonfigKarier<Experience> = {
  jenis: "pengalaman",
  judul: "Pengalaman kerja",
  satuan: "pengalaman",
  kosong: "Belum ada pengalaman kerja.",
  kolom: KOLOM_PENGALAMAN,
  kunci: profilesKeys.experiences,
  daftar: (k) => experiencesApi.list(k),
  hapus: (k, id) => experiencesApi.remove(k, id),
  simpan: (k, n, id) =>
    simpanDengan(
      createExperienceSchema,
      {
        title: n.title ?? "",
        company: teksAtauNull(n.company),
        startDate: teksAtauNull(n.startDate),
        endDate: teksAtauNull(n.endDate),
        description: teksAtauNull(n.description),
      },
      (b) => (id === null ? experiencesApi.create(k, b) : experiencesApi.update(k, id, b)),
    ),
  keNilai: (i) =>
    i === null
      ? nilaiKosong(KOLOM_PENGALAMAN)
      : {
          title: i.title,
          company: baca(i.company),
          startDate: baca(i.startDate),
          endDate: baca(i.endDate),
          description: baca(i.description),
        },
  ringkas: (i) => ({
    judul: i.title,
    keterangan: gabungKeterangan(
      i.company,
      i.startDate === null ? null : `${i.startDate} – ${i.endDate ?? "sekarang"}`,
    ),
  }),
};

const KOLOM_PENDIDIKAN: readonly KolomKarier[] = [
  { nama: "institution", label: "Nama sekolah atau kampus", wajib: true, maks: 160 },
  { nama: "degree", label: "Jenjang", maks: 120, bantuan: "Contoh: SMA, D3, S1." },
  { nama: "field", label: "Jurusan", maks: 120 },
  { nama: "year", label: "Tahun lulus", jenis: "angka", bantuan: "Contoh: 2022." },
];

export const konfigPendidikan: KonfigKarier<Education> = {
  jenis: "pendidikan",
  judul: "Pendidikan",
  satuan: "pendidikan",
  kosong: "Belum ada riwayat pendidikan.",
  kolom: KOLOM_PENDIDIKAN,
  kunci: profilesKeys.educations,
  daftar: (k) => educationsApi.list(k),
  hapus: (k, id) => educationsApi.remove(k, id),
  simpan: (k, n, id) =>
    simpanDengan(
      createEducationSchema,
      {
        institution: n.institution ?? "",
        degree: teksAtauNull(n.degree),
        field: teksAtauNull(n.field),
        year: angkaAtauNull(n.year),
      },
      (b) => (id === null ? educationsApi.create(k, b) : educationsApi.update(k, id, b)),
    ),
  keNilai: (i) =>
    i === null
      ? nilaiKosong(KOLOM_PENDIDIKAN)
      : {
          institution: i.institution,
          degree: baca(i.degree),
          field: baca(i.field),
          year: baca(i.year),
        },
  ringkas: (i) => ({
    judul: i.institution,
    keterangan: gabungKeterangan(i.degree, i.field, i.year === null ? null : String(i.year)),
  }),
};

const KOLOM_KEAHLIAN: readonly KolomKarier[] = [
  { nama: "name", label: "Nama keahlian", wajib: true, maks: 80 },
  { nama: "level", label: "Tingkat", maks: 40, bantuan: "Contoh: dasar, menengah, mahir." },
];

export const konfigKeahlian: KonfigKarier<Skill> = {
  jenis: "keahlian",
  judul: "Keahlian",
  satuan: "keahlian",
  kosong: "Belum ada keahlian.",
  kolom: KOLOM_KEAHLIAN,
  kunci: profilesKeys.skills,
  daftar: (k) => skillsApi.list(k),
  hapus: (k, id) => skillsApi.remove(k, id),
  simpan: (k, n, id) =>
    simpanDengan(createSkillSchema, { name: n.name ?? "", level: teksAtauNull(n.level) }, (b) =>
      id === null ? skillsApi.create(k, b) : skillsApi.update(k, id, b),
    ),
  keNilai: (i) =>
    i === null ? nilaiKosong(KOLOM_KEAHLIAN) : { name: i.name, level: baca(i.level) },
  ringkas: (i) => ({ judul: i.name, keterangan: i.level }),
};

// Satu peta, dipakai layar generik. `KonfigKarier<any>`-nya dibatasi di sini
// saja; tiap konfigurasi di atas tetap bertipe penuh.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KONFIG_KARIER: Readonly<Record<JenisKarier, KonfigKarier<any>>> = {
  pengalaman: konfigPengalaman,
  pendidikan: konfigPendidikan,
  keahlian: konfigKeahlian,
};
