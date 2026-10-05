// Bagian-bagian CV di mobile (PR-092): satu bagian per layar — mitigasi risiko
// "form panjang di layar kecil". Kolom item datang dari `@nawasena/formulir`
// (definisi yang SAMA dengan web); labelnya teks sederhana (U-37).
import {
  buatKolomKeahlian,
  buatKolomOrganisasi,
  buatKolomPendidikan,
  buatKolomPengalaman,
  buatKolomSertifikat,
  buatKolomTautan,
  type KolomItem,
  type KunciLabelResume,
} from "@nawasena/formulir";
import type { ResumeContent } from "@nawasena/schemas";

/** `Record` penuh: kunci baru di paket membuat typecheck mobile merah sampai diberi teks. */
const LABEL: Readonly<Record<KunciLabelResume, string>> = {
  "resume.bantuan.selesai": "Kosongkan kalau masih berlangsung. Contoh: 2024-03-01.",
  "resume.bantuan.tanggal": "Tulis tahun-bulan-tanggal. Contoh: 2024-03-01.",
  "resume.bantuan.tautan": "Harus diawali https:// atau http://",
  "resume.kolom.alamatTautan": "Alamat tautan",
  "resume.kolom.bidang": "Jurusan",
  "resume.kolom.institusi": "Nama sekolah atau kampus",
  "resume.kolom.jenjang": "Jenjang",
  "resume.kolom.keahlian": "Nama keahlian",
  "resume.kolom.mulai": "Tanggal mulai",
  "resume.kolom.namaTautan": "Nama tautan",
  "resume.kolom.organisasi": "Nama organisasi",
  "resume.kolom.penerbit": "Penerbit",
  "resume.kolom.peran": "Peran",
  "resume.kolom.perusahaan": "Nama perusahaan",
  "resume.kolom.posisi": "Nama posisi",
  "resume.kolom.selesai": "Tanggal selesai",
  "resume.kolom.sertifikat": "Nama sertifikat",
  "resume.kolom.tahun": "Tahun lulus",
  "resume.kolom.tahunTerbit": "Tahun terbit",
  "resume.kolom.tingkat": "Tingkat",
  "resume.kolom.uraian": "Uraian pekerjaan",
  "resume.kolom.uraianOrganisasi": "Uraian kegiatan",
};

export const labelResume = (kunci: KunciLabelResume): string => LABEL[kunci];

export type BagianDaftarCv =
  | "experiences"
  | "educations"
  | "skills"
  | "certifications"
  | "organizations";

export type BagianCv = "ringkasan" | "kontak" | BagianDaftarCv;

export interface KonfigDaftarCv<T> {
  judul: string;
  satuan: string;
  kosong: string;
  kolom: readonly KolomItem<T>[];
  itemKosong: T;
}

type ItemDari<B extends BagianDaftarCv> = ResumeContent[B][number];

export const DAFTAR_CV: { readonly [B in BagianDaftarCv]: KonfigDaftarCv<ItemDari<B>> } = {
  experiences: {
    judul: "Pengalaman kerja",
    satuan: "pengalaman",
    kosong: "Belum ada pengalaman kerja di CV ini.",
    kolom: buatKolomPengalaman(labelResume),
    itemKosong: { title: "", company: null, startDate: null, endDate: null, description: null },
  },
  educations: {
    judul: "Pendidikan",
    satuan: "pendidikan",
    kosong: "Belum ada pendidikan di CV ini.",
    kolom: buatKolomPendidikan(labelResume),
    itemKosong: { institution: "", degree: null, field: null, year: null },
  },
  skills: {
    judul: "Keahlian",
    satuan: "keahlian",
    kosong: "Belum ada keahlian di CV ini.",
    kolom: buatKolomKeahlian(labelResume),
    itemKosong: { name: "", level: null },
  },
  certifications: {
    judul: "Sertifikat dan pelatihan",
    satuan: "sertifikat",
    kosong: "Belum ada sertifikat di CV ini.",
    kolom: buatKolomSertifikat(labelResume),
    itemKosong: { name: "", issuer: null, year: null },
  },
  organizations: {
    judul: "Organisasi",
    satuan: "organisasi",
    kosong: "Belum ada organisasi di CV ini.",
    kolom: buatKolomOrganisasi(labelResume),
    itemKosong: { name: "", role: null, startDate: null, endDate: null, description: null },
  },
};

export const KOLOM_TAUTAN = buatKolomTautan(labelResume);

/** Urutan bagian di layar editor — sama dengan urutan di PDF. */
export const URUTAN_BAGIAN: readonly { bagian: BagianCv; judul: string }[] = [
  { bagian: "ringkasan", judul: "Judul dan ringkasan" },
  { bagian: "kontak", judul: "Kontak" },
  { bagian: "experiences", judul: DAFTAR_CV.experiences.judul },
  { bagian: "educations", judul: DAFTAR_CV.educations.judul },
  { bagian: "skills", judul: DAFTAR_CV.skills.judul },
  { bagian: "certifications", judul: DAFTAR_CV.certifications.judul },
  { bagian: "organizations", judul: DAFTAR_CV.organizations.judul },
];

/** Ringkasan isi satu bagian untuk kartu di editor ("3 pengalaman"). */
export function ringkasBagian(isi: ResumeContent, bagian: BagianCv): string {
  if (bagian === "ringkasan") return isi.headline ?? "Belum diisi";
  if (bagian === "kontak") return isi.contact.email ?? isi.contact.phone ?? "Belum diisi";
  const n = isi[bagian].length;
  return n === 0 ? "Belum diisi" : `${n} ${DAFTAR_CV[bagian].satuan}`;
}
