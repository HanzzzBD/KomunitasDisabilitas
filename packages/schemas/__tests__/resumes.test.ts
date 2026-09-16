// Kontrak isi CV (PR-060) — `resumeContentSchema` dan turunannya.
//
// Yang dijaga berkas ini, berurutan sesuai Acceptance Criteria PR-060:
//   AC-2 struktur invalid ditolak dengan pesan per-field sederhana
//   AC-4 resumeSchema TIDAK punya field disabilitas
//   plus: versi kontrak ikut tersimpan (mitigasi risiko "skema berubah setelah
//   dipakai AI"), dan CV boleh lahir kosong (syarat simpan-per-bagian PR-061).
import { describe, it, expect } from "vitest";
import type { z } from "zod";
import {
  createResumeSchema,
  RESUME_CONTENT_SECTIONS,
  RESUME_SCHEMA_VERSION,
  RESUME_YEAR_MAX,
  RESUME_YEAR_MIN,
  resumeContentInputSchema,
  resumeContentSchema,
  resumeContactSchema,
  updateResumeSchema,
  type ResumeContent,
} from "../src/index.js";

/** Kumpulkan pesan kesalahan per path, bentuk yang dipakai FE menempelkannya. */
function pesanPerField(hasil: z.SafeParseReturnType<unknown, unknown>): Record<string, string> {
  if (hasil.success) return {};
  const keluar: Record<string, string> = {};
  for (const issue of hasil.error.issues) keluar[issue.path.join(".")] = issue.message;
  return keluar;
}

describe("resumeContentInputSchema — bentuk dasar", () => {
  it("menerima objek kosong: CV lahir kosong lalu diisi bagian demi bagian", () => {
    const hasil = resumeContentInputSchema.parse({});
    expect(hasil).toEqual({
      schemaVersion: RESUME_SCHEMA_VERSION,
      headline: null,
      summary: null,
      contact: { email: null, phone: null, city: null, province: null, links: [] },
      experiences: [],
      educations: [],
      skills: [],
      certifications: [],
      organizations: [],
    });
  });

  it("menyimpan versi kontrak meski pengirim tidak menyebutnya", () => {
    expect(resumeContentInputSchema.parse({}).schemaVersion).toBe(RESUME_SCHEMA_VERSION);
  });

  it("menolak versi kontrak yang bukan versi ini", () => {
    // Bila kelak versi 2 lahir, baris inilah yang memaksa keputusan sadar
    // tentang apa yang terjadi pada dokumen versi 1 yang sudah tersimpan —
    // alih-alih membiarkannya diterima diam-diam oleh skema yang tidak peduli.
    const hasil = resumeContentInputSchema.safeParse({ schemaVersion: 2 });
    expect(hasil.success).toBe(false);
  });

  it("menolak field asing — `.strict()` di seluruh objek", () => {
    expect(resumeContentInputSchema.safeParse({ bagianKarangan: [] }).success).toBe(false);
    expect(resumeContactSchema.safeParse({ alamatLengkap: "Jl. Mawar" }).success).toBe(false);
  });
});

describe("resumeContentSchema — bentuk yang DIBACA", () => {
  it("menuntut seluruh bagian hadir", () => {
    // Terpisah dari skema tulis dengan sengaja (lihat `BAGIAN` di resumes.ts).
    // Yang dijaga di sini adalah janji kepada pembacanya — editor, template PDF,
    // ekstraksi AI: tidak satu pun perlu cabang kode untuk bagian yang hilang.
    expect(resumeContentSchema.safeParse({}).success).toBe(false);
  });

  it("menerima hasil parse skema tulis apa adanya", () => {
    // Inilah yang membuat pemisahan kedua skema aman: apa pun yang lolos gerbang
    // tulis SELALU berbentuk seperti yang dijanjikan gerbang baca. Tanpa test
    // ini, keduanya bisa menyimpang tanpa satu pun gejala.
    const ditulis = resumeContentInputSchema.parse({ headline: "Desainer grafis" });
    expect(resumeContentSchema.safeParse(ditulis).success).toBe(true);
  });
});

describe("isi CV TIDAK memuat data disabilitas (AC-4)", () => {
  /**
   * Nama bagian diturunkan DARI SKEMANYA, bukan ditulis ulang di sini.
   *
   * Daftar tangan akan tetap hijau pada hari seseorang menambahkan bagian baru,
   * dan bagian baru itulah satu-satunya cara field disabilitas bisa masuk.
   */
  it("daftar bagian persis seperti yang dikontrakkan", () => {
    expect(RESUME_CONTENT_SECTIONS).toEqual([
      "schemaVersion",
      "headline",
      "summary",
      "contact",
      "experiences",
      "educations",
      "skills",
      "certifications",
      "organizations",
    ]);
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    expect(RESUME_CONTENT_SECTIONS.length).toBeGreaterThan(5);
  });

  it.each([
    "disabilityTypes",
    "disability_types",
    "accommodationNeeds",
    "accommodation_needs",
    "sensitive",
    "disclosureDefault",
  ])("menolak field %s di akar", (nama) => {
    // Pengungkapan ragam disabilitas HARUS tetap menjadi keputusan terpisah per
    // lamaran (PR-075). CV adalah berkas yang dikirim pengguna ke perusahaan;
    // apa pun yang masuk ke sini ikut terkirim, selamanya, ke semua orang.
    expect(resumeContentInputSchema.safeParse({ [nama]: ["tuli"] }).success).toBe(false);
  });

  it("tidak satu pun nama bagian menyerempet ragam/akomodasi", () => {
    const mencurigakan = /disab|akomodasi|accommodation|sensitive/i;
    expect(RESUME_CONTENT_SECTIONS.filter((n) => mencurigakan.test(n))).toEqual([]);
  });
});

describe("validasi per-field berbahasa manusia (AC-2)", () => {
  it("judul posisi kosong ditolak dengan pesan pada field-nya", () => {
    const hasil = resumeContentInputSchema.safeParse({ experiences: [{ title: "   " }] });
    expect(pesanPerField(hasil)).toEqual({
      "experiences.0.title": "Nama posisi tidak boleh kosong",
    });
  });

  it("tanggal selesai mendahului tanggal mulai ditolak pada endDate", () => {
    const hasil = resumeContentInputSchema.safeParse({
      experiences: [{ title: "Analis Data", startDate: "2022-05-01", endDate: "2021-01-01" }],
    });
    expect(pesanPerField(hasil)).toEqual({
      "experiences.0.endDate": "Tanggal selesai tidak boleh lebih awal daripada tanggal mulai",
    });
  });

  it("tanggal yang tidak ada di kalender ditolak", () => {
    // 2026 bukan kabisat. Tanpa pemeriksaan ini `new Date` menggesernya diam-diam
    // menjadi 1 Maret — lihat `dateOnlySchema` di profiles.ts.
    const hasil = resumeContentInputSchema.safeParse({
      experiences: [{ title: "Analis Data", startDate: "2026-02-30" }],
    });
    expect(pesanPerField(hasil)["experiences.0.startDate"]).toBe("Tanggal itu tidak ada di kalender");
  });

  it.each([RESUME_YEAR_MIN - 1, RESUME_YEAR_MAX + 1])("menolak tahun %i", (tahun) => {
    const hasil = resumeContentInputSchema.safeParse({
      educations: [{ institution: "Universitas Fiktif", year: tahun }],
    });
    expect(hasil.success).toBe(false);
  });

  it("menerima tahun perkiraan lulus di masa depan", () => {
    // Batas atasnya BUKAN "tahun ini": mahasiswa tingkat akhir menuliskan
    // perkiraan lulusnya, dan menolaknya berarti ia tidak bisa menuliskan
    // kuliahnya sama sekali.
    const hasil = resumeContentInputSchema.safeParse({
      educations: [{ institution: "Universitas Fiktif", year: RESUME_YEAR_MIN + 80 }],
    });
    expect(hasil.success).toBe(true);
  });

  it("menolak tautan berskema javascript:", () => {
    // Template PDF (PR-063) menuliskannya sebagai href.
    const hasil = resumeContentInputSchema.safeParse({
      contact: { links: [{ label: "Portofolio", url: "javascript:alert(1)" }] },
    });
    expect(hasil.success).toBe(false);
  });

  it("menerima tautan https biasa", () => {
    const hasil = resumeContentInputSchema.parse({
      contact: { links: [{ label: "Portofolio", url: "https://contoh.test/karya" }] },
    });
    expect(hasil.contact.links).toEqual([
      { label: "Portofolio", url: "https://contoh.test/karya" },
    ]);
  });

  it("teks kosong menjadi null, bukan string kosong", () => {
    const hasil = resumeContentInputSchema.parse({ headline: "   ", summary: "" });
    expect(hasil.headline).toBeNull();
    expect(hasil.summary).toBeNull();
  });

  it("menolak larik yang melampaui batas jumlah elemen", () => {
    const banyak = Array.from({ length: 61 }, (_, i) => ({ name: `Keahlian ${String(i)}` }));
    expect(pesanPerField(resumeContentInputSchema.safeParse({ skills: banyak }))).toEqual({
      skills: "Keahlian maksimal 60",
    });
  });
});

describe("urutan larik adalah urutan tampil (syarat reorder PR-061)", () => {
  it("tidak menyusun ulang apa pun", () => {
    const isi: ResumeContent = resumeContentInputSchema.parse({
      experiences: [
        { title: "Posisi Ketiga", startDate: "2018-01-01" },
        { title: "Posisi Pertama", startDate: "2024-01-01" },
        { title: "Posisi Kedua", startDate: "2021-01-01" },
      ],
    });
    // Sengaja dikirim TIDAK kronologis: bila suatu saat ada yang menambahkan
    // pengurutan di skema, tombol naik/turun di editor akan berhenti bekerja
    // tanpa satu pun pesan kesalahan. Test inilah yang akan merah lebih dulu.
    expect(isi.experiences.map((e) => e.title)).toEqual([
      "Posisi Ketiga",
      "Posisi Pertama",
      "Posisi Kedua",
    ]);
  });
});

describe("kontrak HTTP CRUD", () => {
  it("createResumeSchema memberi isi kosong bila `content` tidak dikirim", () => {
    const hasil = createResumeSchema.parse({ title: "CV Utama" });
    expect(hasil.content.schemaVersion).toBe(RESUME_SCHEMA_VERSION);
    expect(hasil.content.experiences).toEqual([]);
  });

  it("createResumeSchema menolak judul kosong", () => {
    expect(pesanPerField(createResumeSchema.safeParse({ title: "  " }))).toEqual({
      title: "Judul CV tidak boleh kosong",
    });
  });

  it("createResumeSchema TIDAK menerima createdVia dari klien", () => {
    // Jalur lahirnya CV ditentukan endpoint yang dipakai, bukan diakui klien —
    // kalau tidak, angka "berapa CV lahir dari AI" tidak berarti apa-apa.
    const hasil = createResumeSchema.safeParse({ title: "CV Utama", createdVia: "ai_chat" });
    expect(hasil.success).toBe(false);
  });

  it("updateResumeSchema menerima patch kosong maupun sebagian", () => {
    expect(updateResumeSchema.parse({})).toEqual({});
    expect(updateResumeSchema.parse({ title: "CV Baru" })).toEqual({ title: "CV Baru" });
  });

  it("updateResumeSchema menolak field asing", () => {
    expect(updateResumeSchema.safeParse({ pdfUrl: "https://contoh.test/x.pdf" }).success).toBe(
      false,
    );
    // `createdVia` juga tidak bisa diubah: jalur lahirnya satu CV tidak berubah.
    expect(updateResumeSchema.safeParse({ createdVia: "manual" }).success).toBe(false);
  });
});
