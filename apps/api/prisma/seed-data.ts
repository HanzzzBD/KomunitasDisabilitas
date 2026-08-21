// Seed dev & fixture E2E (PR-009 admin; PR-012 persona lengkap).
//
// - IDEMPOTENT: upsert by fixture ID tetap — 2× jalan = hasil identik,
//   data dev lain tidak tersentuh (bukan delete-recreate).
// - GUARD PRODUKSI: menolak jalan bila NODE_ENV=production.
// - Kolom sensitif (disability_types, accommodation_needs) SENGAJA NULL —
//   util enkripsi baru ada di PR-013; dilarang isi plaintext (bytea = ciphertext).
//   Kebutuhan akomodasi persona terwakili di preferensi UI + akomodasi jobs.
// - ID fixture stabil: prisma/fixtures.ts + dokumentasi prisma/FIXTURES.md.
import type { PrismaClient } from "@prisma/client";
import type { AccommodationNeed, DisabilityType } from "@nawasena/schemas";
import { uuidV7 } from "../src/core/ids/index.js";
import { FIXTURE, FIXTURE_PHONES } from "./fixtures.js";

export class SeedProductionError extends Error {
  constructor() {
    super("Seed DILARANG jalan di production — data fixture hanya untuk dev/test/CI.");
    this.name = "SeedProductionError";
  }
}

interface PersonaSpec {
  id: string;
  phone: string;
  fullName: string;
  aksesibilitas: Partial<{
    textScale: number;
    highContrast: boolean;
    reduceMotion: boolean;
    simpleLanguage: boolean;
    prefersSignLanguage: boolean;
    largeTouchTargets: boolean;
    screenReaderHint: boolean;
  }>;
  profil: {
    headline: string;
    summary: string;
    city: string;
    province: string;
    openToRemote: boolean;
  };
  pengalaman?: { title: string; company: string };
  pendidikan: { institution: string; degree: string; field: string; year: number };
  keahlian: string[];
  resumeId: string;
}

/// 4 persona PRD §4 — data dummy jelas (nama fiktif, phone prefix +62115).
const PERSONAS: PersonaSpec[] = [
  {
    id: FIXTURE.users.rina,
    phone: FIXTURE_PHONES.rina,
    fullName: "Rina Fiktif (Persona Tuli)",
    aksesibilitas: { prefersSignLanguage: true, simpleLanguage: true },
    profil: {
      headline: "Desainer grafis lulusan SMK",
      summary: "Terampil Photoshop & Illustrator. Komunikasi paling nyaman via teks atau BISINDO.",
      city: "Jakarta",
      province: "DKI Jakarta",
      openToRemote: false,
    },
    pendidikan: {
      institution: "SMK Negeri 1 Jakarta",
      degree: "SMK",
      field: "Desain Grafis",
      year: 2020,
    },
    keahlian: ["Adobe Photoshop", "Adobe Illustrator", "Desain Sosial Media"],
    resumeId: FIXTURE.resumes.rina,
  },
  {
    id: FIXTURE.users.bayu,
    phone: FIXTURE_PHONES.bayu,
    fullName: "Bayu Fiktif (Persona Netra)",
    aksesibilitas: { screenReaderHint: true, highContrast: true },
    profil: {
      headline: "Sarjana komunikasi, mahir TalkBack/NVDA",
      summary: "Mencari peran admin, customer service, atau penulisan konten.",
      city: "Yogyakarta",
      province: "DI Yogyakarta",
      openToRemote: true,
    },
    pengalaman: { title: "Penulis Konten Lepas", company: "Media Daring Fiktif" },
    pendidikan: {
      institution: "Universitas Fiktif Yogyakarta",
      degree: "S1",
      field: "Ilmu Komunikasi",
      year: 2021,
    },
    keahlian: ["Penulisan Konten", "Customer Service", "NVDA/TalkBack"],
    resumeId: FIXTURE.resumes.bayu,
  },
  {
    id: FIXTURE.users.sari,
    phone: FIXTURE_PHONES.sari,
    fullName: "Sari Fiktif (Persona Daksa)",
    aksesibilitas: { largeTouchTargets: true },
    profil: {
      headline: "Staf keuangan berpengalaman 5 tahun",
      summary: "Cari kerja remote/hybrid atau kantor dengan akses kursi roda.",
      city: "Bandung",
      province: "Jawa Barat",
      openToRemote: true,
    },
    pengalaman: { title: "Staf Keuangan", company: "PT Fiktif Sejahtera" },
    pendidikan: {
      institution: "Universitas Fiktif Bandung",
      degree: "S1",
      field: "Akuntansi",
      year: 2017,
    },
    keahlian: ["Akuntansi", "Excel", "Pelaporan Keuangan"],
    resumeId: FIXTURE.resumes.sari,
  },
  {
    id: FIXTURE.users.dimas,
    phone: FIXTURE_PHONES.dimas,
    fullName: "Dimas Fiktif (Persona Autisme)",
    aksesibilitas: { simpleLanguage: true, reduceMotion: true },
    profil: {
      headline: "Lulusan D3 informatika, teliti pada pola dan data",
      summary: "Mencari pekerjaan QA, data entry, atau programming dengan ekspektasi jelas.",
      city: "Jakarta",
      province: "DKI Jakarta",
      openToRemote: true,
    },
    pendidikan: {
      institution: "Politeknik Fiktif Jakarta",
      degree: "D3",
      field: "Informatika",
      year: 2023,
    },
    keahlian: ["QA Manual", "Data Entry", "SQL Dasar"],
    resumeId: FIXTURE.resumes.dimas,
  },
];

// Taksonomi akomodasi (selaras companies.accommodations_available & jobs.accommodations).
//
// `satisfies` mengikatnya pada `accommodationNeedSchema` di @nawasena/schemas
// (PR-037), yang juga dipakai kebutuhan akomodasi pencari kerja. Kedua sisi
// itulah yang kelak dipertemukan matching (PR-069) — dan dua daftar yang
// berbeda tipis adalah cara paling tenang untuk membuat pencocokan gagal tanpa
// satu pun error. Nilai yang salah ketik di sini kini typecheck merah, bukan
// lowongan yang diam-diam tidak pernah cocok dengan siapa pun.
const AKOM = {
  ramp: "akses_kursi_roda",
  sr: "ramah_screen_reader",
  teks: "wawancara_via_teks",
  fleks: "jam_kerja_fleksibel",
  tenang: "ruang_kerja_tenang",
  isyarat: "juru_bahasa_isyarat",
} as const satisfies Record<string, AccommodationNeed>;

interface JobSpec {
  key: string;
  companyId: string;
  title: string;
  description: string;
  workMode: "onsite" | "hybrid" | "remote";
  employmentType: "full_time" | "part_time" | "contract" | "internship" | "freelance";
  accommodations: AccommodationNeed[];
  /** Terikat taksonomi PR-037: sisi lowongan dan sisi pencari kerja harus
   *  memakai nilai yang SAMA agar matching (PR-069) bisa mempertemukannya. */
  welcomed?: DisabilityType[];
  status?: "draft" | "published" | "closed";
  salary?: [number, number];
}

/// 20 jobs — matriks variasi work_mode × akomodasi × status untuk test matching.
const JOBS: JobSpec[] = [
  // Kreatif (relevan Rina)
  {
    key: "j01",
    companyId: FIXTURE.companies.kreatifStudio,
    title: "Desainer Grafis",
    description: "Membuat desain sosial media dan materi promosi. Komunikasi tim via chat.",
    workMode: "onsite",
    employmentType: "full_time",
    accommodations: [AKOM.teks, AKOM.isyarat],
    welcomed: ["tuli"],
    salary: [4500000, 6000000],
  },
  {
    key: "j02",
    companyId: FIXTURE.companies.kreatifStudio,
    title: "Ilustrator Digital",
    description: "Ilustrasi untuk konten edukasi.",
    workMode: "hybrid",
    employmentType: "contract",
    accommodations: [AKOM.teks],
    welcomed: ["tuli"],
  },
  {
    key: "j03",
    companyId: FIXTURE.companies.warungDigital,
    title: "Editor Video Junior",
    description: "Edit video promosi UMKM.",
    workMode: "remote",
    employmentType: "freelance",
    accommodations: [AKOM.fleks],
  },
  // Admin/CS/penulisan (relevan Bayu)
  {
    key: "j04",
    companyId: FIXTURE.companies.inklusifTech,
    title: "Penulis Konten",
    description: "Menulis artikel blog dan dokumentasi produk.",
    workMode: "remote",
    employmentType: "full_time",
    accommodations: [AKOM.sr, AKOM.fleks],
    welcomed: ["netra"],
    salary: [5000000, 7000000],
  },
  {
    key: "j05",
    companyId: FIXTURE.companies.inklusifTech,
    title: "Customer Service Chat",
    description: "Melayani pelanggan sepenuhnya via chat tertulis.",
    workMode: "remote",
    employmentType: "full_time",
    accommodations: [AKOM.sr, AKOM.teks],
    welcomed: ["netra", "tuli"],
    salary: [4200000, 5500000],
  },
  {
    key: "j06",
    companyId: FIXTURE.companies.dataNusantara,
    title: "Admin Data Online",
    description: "Input dan verifikasi data pelanggan.",
    workMode: "remote",
    employmentType: "part_time",
    accommodations: [AKOM.sr, AKOM.fleks],
  },
  {
    key: "j07",
    companyId: FIXTURE.companies.tokoBerkah,
    title: "Admin Media Sosial",
    description: "Balas komentar & DM toko.",
    workMode: "hybrid",
    employmentType: "part_time",
    accommodations: [AKOM.teks],
  },
  // Keuangan (relevan Sari)
  {
    key: "j08",
    companyId: FIXTURE.companies.inklusifTech,
    title: "Staf Keuangan",
    description: "Pembukuan dan pelaporan bulanan. Kantor beraccess kursi roda.",
    workMode: "hybrid",
    employmentType: "full_time",
    accommodations: [AKOM.ramp, AKOM.fleks],
    welcomed: ["daksa"],
    salary: [6000000, 8000000],
  },
  {
    key: "j09",
    companyId: FIXTURE.companies.dataNusantara,
    title: "Akuntan Remote",
    description: "Kelola pembukuan klien UMKM sepenuhnya remote.",
    workMode: "remote",
    employmentType: "full_time",
    accommodations: [AKOM.fleks],
    welcomed: ["daksa"],
    salary: [6500000, 9000000],
  },
  {
    key: "j10",
    companyId: FIXTURE.companies.tokoBerkah,
    title: "Kasir Toko",
    description: "Melayani pembayaran. Toko memiliki ramp dan lorong lebar.",
    workMode: "onsite",
    employmentType: "full_time",
    accommodations: [AKOM.ramp],
    salary: [3500000, 4200000],
  },
  {
    key: "j11",
    companyId: FIXTURE.companies.inklusifTech,
    title: "Analis Anggaran",
    description: "Analisis anggaran proyek.",
    workMode: "onsite",
    employmentType: "contract",
    accommodations: [AKOM.ramp, AKOM.tenang],
  },
  // QA/data (relevan Dimas)
  {
    key: "j12",
    companyId: FIXTURE.companies.inklusifTech,
    title: "QA Tester Junior",
    description: "Menjalankan test case terdokumentasi dengan langkah eksplisit.",
    workMode: "hybrid",
    employmentType: "full_time",
    accommodations: [AKOM.tenang, AKOM.fleks],
    welcomed: ["autisme"],
    salary: [5000000, 6500000],
  },
  {
    key: "j13",
    companyId: FIXTURE.companies.dataNusantara,
    title: "Data Entry Specialist",
    description: "Input data terstruktur dengan panduan jelas dan target harian pasti.",
    workMode: "remote",
    employmentType: "full_time",
    accommodations: [AKOM.tenang, AKOM.fleks],
    welcomed: ["autisme"],
    salary: [4000000, 5000000],
  },
  {
    key: "j14",
    companyId: FIXTURE.companies.warungDigital,
    title: "Junior Programmer",
    description: "Maintenance website dengan spesifikasi tugas tertulis.",
    workMode: "remote",
    employmentType: "internship",
    accommodations: [AKOM.tenang],
  },
  {
    key: "j15",
    companyId: FIXTURE.companies.dataNusantara,
    title: "Pengolah Data Excel",
    description: "Membersihkan dan merapikan dataset.",
    workMode: "remote",
    employmentType: "freelance",
    accommodations: [AKOM.fleks],
  },
  // Umum / variasi status
  {
    key: "j16",
    companyId: FIXTURE.companies.tokoBerkah,
    title: "Staf Gudang",
    description: "Menata stok barang.",
    workMode: "onsite",
    employmentType: "full_time",
    accommodations: [],
    salary: [3800000, 4500000],
  },
  {
    key: "j17",
    companyId: FIXTURE.companies.warungDigital,
    title: "Host Live Streaming",
    description: "Membawakan sesi live penjualan.",
    workMode: "onsite",
    employmentType: "part_time",
    accommodations: [],
  },
  {
    key: "j18",
    companyId: FIXTURE.companies.kreatifStudio,
    title: "Fotografer Produk",
    description: "Foto katalog produk.",
    workMode: "onsite",
    employmentType: "freelance",
    accommodations: [AKOM.teks],
    status: "draft",
  },
  {
    key: "j19",
    companyId: FIXTURE.companies.inklusifTech,
    title: "HR Generalist",
    description: "Rekrutmen dan administrasi SDM.",
    workMode: "hybrid",
    employmentType: "full_time",
    accommodations: [AKOM.ramp, AKOM.sr],
    status: "draft",
  },
  {
    key: "j20",
    companyId: FIXTURE.companies.dataNusantara,
    title: "Operator Entry Batch",
    description: "Proyek migrasi data (selesai).",
    workMode: "remote",
    employmentType: "contract",
    accommodations: [AKOM.fleks],
    status: "closed",
  },
];

/** Seluruh seed — dipanggil entry & test. Idempotent (upsert by fixture ID). */
export async function runSeed(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new SeedProductionError();

  // --- Admin (PR-009; ID by-phone karena sudah ada sebelum fixtures) ---
  const adminPhone = process.env.SEED_ADMIN_PHONE ?? "+620000000001";
  const admin = await prisma.user.findFirst({ where: { phone: adminPhone, deletedAt: null } });
  if (admin === null) {
    await prisma.user.create({
      data: {
        id: uuidV7(),
        phone: adminPhone,
        fullName: process.env.SEED_ADMIN_NAME ?? "Admin Dev",
        role: "admin",
      },
    });
    await prisma.auditLog.create({
      data: { id: uuidV7(), actorId: null, action: "seed.admin_dibuat", entity: "users" },
    });
  } else if (admin.role !== "admin") {
    await prisma.user.update({ where: { id: admin.id }, data: { role: "admin" } });
  }

  // --- 4 persona PRD §4 ---
  for (const p of PERSONAS) {
    await prisma.user.upsert({
      where: { id: p.id },
      create: { id: p.id, phone: p.phone, fullName: p.fullName, role: "seeker" },
      update: { phone: p.phone, fullName: p.fullName },
    });
    await prisma.accessibilityProfile.upsert({
      where: { userId: p.id },
      create: { userId: p.id, ...p.aksesibilitas },
      update: p.aksesibilitas,
    });
    // Kolom sensitif TIDAK diisi (lihat header). disclosure_default = default.
    await prisma.seekerProfile.upsert({
      where: { userId: p.id },
      create: { userId: p.id, ...p.profil },
      update: p.profil,
    });
    if (p.pengalaman) {
      const expId = `${p.id.slice(0, -1)}e`; // derivatif stabil dari user id
      await prisma.experience.upsert({
        where: { id: expId },
        create: { id: expId, userId: p.id, ...p.pengalaman },
        update: p.pengalaman,
      });
    }
    const eduId = `${p.id.slice(0, -1)}d`;
    await prisma.education.upsert({
      where: { id: eduId },
      create: { id: eduId, userId: p.id, ...p.pendidikan },
      update: p.pendidikan,
    });
    for (const [i, nama] of p.keahlian.entries()) {
      const skillId = `${p.id.slice(0, -1)}${(7 + i).toString(16)}`;
      await prisma.skill.upsert({
        where: { id: skillId },
        create: { id: skillId, userId: p.id, name: nama },
        update: { name: nama },
      });
    }
    await prisma.resume.upsert({
      where: { id: p.resumeId },
      create: {
        id: p.resumeId,
        userId: p.id,
        title: `CV ${p.fullName.split(" ")[0]}`,
        content: { headline: p.profil.headline, ringkasan: p.profil.summary, keahlian: p.keahlian },
        createdVia: "manual",
      },
      update: {},
    });
  }

  // --- 5 companies (variasi inclusivity_status & akomodasi) ---
  const COMPANIES = [
    {
      id: FIXTURE.companies.inklusifTech,
      name: "PT Inklusif Teknologi (Fiktif)",
      city: "Jakarta",
      inclusivityStatus: "verified" as const,
      accommodationsAvailable: [AKOM.ramp, AKOM.sr, AKOM.teks, AKOM.fleks, AKOM.tenang],
    },
    {
      id: FIXTURE.companies.kreatifStudio,
      name: "Kreatif Studio Nusantara (Fiktif)",
      city: "Jakarta",
      inclusivityStatus: "verified" as const,
      accommodationsAvailable: [AKOM.teks, AKOM.isyarat],
    },
    {
      id: FIXTURE.companies.dataNusantara,
      name: "Data Nusantara Remote (Fiktif)",
      city: "Yogyakarta",
      inclusivityStatus: "self_claimed" as const,
      accommodationsAvailable: [AKOM.fleks, AKOM.sr],
    },
    {
      id: FIXTURE.companies.tokoBerkah,
      name: "Toko Berkah Jaya (Fiktif)",
      city: "Bandung",
      inclusivityStatus: "self_claimed" as const,
      accommodationsAvailable: [AKOM.ramp],
    },
    {
      id: FIXTURE.companies.warungDigital,
      name: "Warung Digital Kita (Fiktif)",
      city: "Surabaya",
      inclusivityStatus: "unverified" as const,
      accommodationsAvailable: [],
    },
  ];
  for (const c of COMPANIES) {
    const { id, ...data } = c;
    await prisma.company.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  // --- 20 jobs ---
  for (const j of JOBS) {
    const id = FIXTURE.jobs[j.key];
    if (id === undefined) throw new Error(`Fixture job hilang: ${j.key}`);
    const status = j.status ?? "published";
    const data = {
      companyId: j.companyId,
      title: j.title,
      description: j.description,
      employmentType: j.employmentType,
      workMode: j.workMode,
      accommodations: j.accommodations,
      welcomedDisabilityTypes: j.welcomed ?? [],
      status,
      salaryMin: j.salary?.[0] ?? null,
      salaryMax: j.salary?.[1] ?? null,
      publishedAt: status === "draft" ? null : new Date("2026-07-01T00:00:00Z"),
      source: "admin_curated" as const,
    };
    await prisma.job.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  // --- Lamaran contoh (pipeline beragam; status_history append-only) ---
  const APPS = [
    {
      id: FIXTURE.applications.rinaKeJ01,
      userId: FIXTURE.users.rina,
      jobKey: "j01",
      resumeId: FIXTURE.resumes.rina,
      status: "submitted" as const,
      history: [],
    },
    {
      id: FIXTURE.applications.bayuKeJ05,
      userId: FIXTURE.users.bayu,
      jobKey: "j05",
      resumeId: FIXTURE.resumes.bayu,
      status: "in_review" as const,
      history: [{ from: "submitted", to: "in_review", by: "admin", at: "2026-07-05T03:00:00Z" }],
    },
    {
      id: FIXTURE.applications.bayuKeJ06,
      userId: FIXTURE.users.bayu,
      jobKey: "j06",
      resumeId: FIXTURE.resumes.bayu,
      status: "submitted" as const,
      history: [],
    },
    {
      id: FIXTURE.applications.sariKeJ09,
      userId: FIXTURE.users.sari,
      jobKey: "j09",
      resumeId: FIXTURE.resumes.sari,
      status: "hired" as const,
      history: [
        { from: "submitted", to: "in_review", by: "admin", at: "2026-07-03T03:00:00Z" },
        { from: "in_review", to: "interview", by: "admin", at: "2026-07-06T03:00:00Z" },
        { from: "interview", to: "offered", by: "admin", at: "2026-07-10T03:00:00Z" },
        { from: "offered", to: "hired", by: "admin", at: "2026-07-12T03:00:00Z" },
      ],
      hiredAt: "2026-07-12T03:00:00Z",
    },
    {
      id: FIXTURE.applications.dimasKeJ13,
      userId: FIXTURE.users.dimas,
      jobKey: "j13",
      resumeId: FIXTURE.resumes.dimas,
      status: "interview" as const,
      history: [
        { from: "submitted", to: "in_review", by: "admin", at: "2026-07-08T03:00:00Z" },
        { from: "in_review", to: "interview", by: "admin", at: "2026-07-11T03:00:00Z" },
      ],
    },
    {
      id: FIXTURE.applications.dimasKeJ14,
      userId: FIXTURE.users.dimas,
      jobKey: "j14",
      resumeId: FIXTURE.resumes.dimas,
      status: "rejected" as const,
      history: [{ from: "submitted", to: "rejected", by: "admin", at: "2026-07-09T03:00:00Z" }],
    },
  ];
  for (const a of APPS) {
    const jobId = FIXTURE.jobs[a.jobKey];
    if (jobId === undefined) throw new Error(`Fixture job hilang: ${a.jobKey}`);
    const data = {
      userId: a.userId,
      jobId,
      resumeId: a.resumeId,
      status: a.status,
      statusHistory: a.history,
      hiredConfirmedAt: "hiredAt" in a && a.hiredAt !== undefined ? new Date(a.hiredAt) : null,
      appliedAt: new Date("2026-07-02T03:00:00Z"),
    };
    await prisma.application.upsert({
      where: { id: a.id },
      create: { id: a.id, ...data },
      update: data,
    });
  }
}

/** Ringkasan isi DB untuk log seed & verifikasi manual. */
export async function seedSummary(prisma: PrismaClient): Promise<Record<string, number>> {
  const [users, companies, jobs, applications, resumes] = await Promise.all([
    prisma.user.count(),
    prisma.company.count(),
    prisma.job.count(),
    prisma.application.count(),
    prisma.resume.count(),
  ]);
  return { users, companies, jobs, applications, resumes };
}
