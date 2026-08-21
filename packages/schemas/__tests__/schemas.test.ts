import { describe, it, expect, expectTypeOf } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCESSIBILITY_DEFAULTS,
  accessibilityResponseSchema,
  errorEnvelopeSchema,
  paginationQuerySchema,
  pdpPurgeJobSchema,
  requestOtpSchema,
  safeProfileSchema,
  seekerProfileResponseSchema,
  SEEKER_PROFILE_KOSONG,
  updateSeekerProfileSchema,
  createEducationSchema,
  createExperienceSchema,
  createSkillSchema,
  dateOnlySchema,
  EDUCATION_YEAR_MAX,
  EDUCATION_YEAR_MIN,
  profileUpdatedEventSchema,
  updateExperienceSchema,
  type RequestOtp,
  type SafeProfile,
} from "../src/index.js";
import { renderOpenApiJson, buildOpenApiDocument } from "../src/openapi.js";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("contoh skema end-to-end (requestOtpSchema)", () => {
  it("menerima input valid (runtime)", () => {
    const parsed = requestOtpSchema.parse({ phone: "+6281234567890" });
    expect(parsed.phone).toBe("+6281234567890");
  });

  it("tipe TS ter-infer dari skema yang sama (type)", () => {
    expectTypeOf<RequestOtp>().toEqualTypeOf<{ phone: string }>();
  });

  it("menolak nomor non-+62 dengan pesan Bahasa Indonesia", () => {
    const res = requestOtpSchema.safeParse({ phone: "081234567890" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/\+62/);
    }
  });
});

describe("skema fondasi (common)", () => {
  it("error envelope valid: {code, message, hint?}", () => {
    expect(
      errorEnvelopeSchema.parse({
        code: "VALIDATION_ERROR",
        message: "Input tidak valid",
        hint: "Periksa format nomor HP Anda",
      }),
    ).toBeTruthy();
  });

  it("error envelope menolak code non-UPPER_SNAKE_CASE", () => {
    expect(errorEnvelopeSchema.safeParse({ code: "notValid", message: "x" }).success).toBe(false);
  });

  it("pagination: default limit 20, tolak limit > 100, coerce string angka", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(paginationQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(paginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe("payload job purge PDP (PR-023)", () => {
  it("payload kosong dari cron BUKAN dry-run", () => {
    // Job terjadwal dikirim tanpa isi. Kalau default-nya `true`, purge harian
    // akan melaporkan sukses setiap hari tanpa pernah menghapus apa pun — dan
    // janji "data hilang ≤ 30 hari" berhenti ditepati tanpa satu pun gejala.
    expect(pdpPurgeJobSchema.parse({}).dryRun).toBe(false);
    expect(pdpPurgeJobSchema.parse({ dryRun: true }).dryRun).toBe(true);
  });
});

describe("amplop respons preferensi aksesibilitas (PR-035)", () => {
  it("menerima bentuk yang BENAR-BENAR dijawab server: `{ data }`", () => {
    // Bentuk acuannya diambil dari controller PR-034
    // (`res.status(200).json({ data: await service.getMe(...) })`), bukan dari
    // fixture yang ditulis tangan — fixture bebas ikut salah bersama skemanya.
    const parsed = accessibilityResponseSchema.parse({ data: ACCESSIBILITY_DEFAULTS });
    expect(parsed.data.textScale).toBe(100);
    expect(parsed.data.screenReaderHint).toBe(false);
  });

  it("MENOLAK preferensi telanjang tanpa amplop", () => {
    // Inilah yang membuktikan pembungkusnya bekerja. Skema yang menerima kedua
    // bentuk tidak menjaga apa pun — dan bila ia diam-diam salah, setiap
    // panggilan yang BERHASIL di produksi berakhir `RESPONS_TIDAK_DIKENAL`.
    expect(accessibilityResponseSchema.safeParse(ACCESSIBILITY_DEFAULTS).success).toBe(false);
  });

  it("menolak amplop yang isinya tidak lengkap", () => {
    const { screenReaderHint: _buang, ...kurang } = ACCESSIBILITY_DEFAULTS;
    expect(accessibilityResponseSchema.safeParse({ data: kurang }).success).toBe(false);
  });
});

describe("pemisahan aman/sensitif profil (PR-037)", () => {
  /** Nama kolom sensitif menurut schema.prisma — sumber kebenarannya. */
  const SENSITIF = ["disabilityTypes", "accommodationNeeds"];

  it("bagian AMAN tidak punya tempat bagi field sensitif", () => {
    // Inilah mitigasi risiko PR-037 ("kebocoran via serialisasi tak sengaja")
    // dalam bentuk yang bisa gagal: `safeProfileSchema` adalah bentuk yang
    // dipakai response non-pemilik, dan menambahkan field sensitif ke dalamnya
    // harus menjadi kegagalan yang berisik — bukan keputusan yang lolos review
    // karena tidak ada yang menyadarinya. PR-039 melanjutkannya ke repository.
    const kunci = Object.keys(safeProfileSchema.shape);
    for (const field of SENSITIF) {
      expect(kunci, `${field} tidak boleh ada di SafeProfile`).not.toContain(field);
    }
    // Penjaga anti-hampa: shape yang kosong akan membuat pemeriksaan di atas
    // hijau tanpa memeriksa apa pun.
    expect(kunci).toContain("headline");
    expect(kunci).toContain("disclosureDefault");
  });

  it("tipe SafeProfile menolak field sensitif secara compile-time", () => {
    expectTypeOf<SafeProfile>().not.toHaveProperty("disabilityTypes");
    expectTypeOf<SafeProfile>().not.toHaveProperty("sensitive");
  });

  it("profil kosong memenuhi kontraknya sendiri", () => {
    // `SEEKER_PROFILE_KOSONG` adalah jawaban bagi akun yang belum pernah
    // menyentuh /me/profile. Konstanta yang tidak lolos skemanya sendiri berarti
    // setiap akun baru menerima jawaban yang ditolak klien.
    expect(seekerProfileResponseSchema.safeParse({ data: SEEKER_PROFILE_KOSONG }).success).toBe(
      true,
    );
  });

  it("MENOLAK profil telanjang tanpa amplop `{ data }`", () => {
    expect(seekerProfileResponseSchema.safeParse(SEEKER_PROFILE_KOSONG).success).toBe(false);
  });

  it("badan PUT kosong sah — tidak ada field yang wajib disebut", () => {
    // PUT bersifat GABUNG, bukan ganti seluruhnya: klien hanya mengirim bagian
    // yang ia ubah (form simpan-per-bagian, PR-040).
    expect(updateSeekerProfileSchema.parse({})).toEqual({});
  });

  it("string kosong dan spasi menjadi null, bukan tersimpan apa adanya", () => {
    const parsed = updateSeekerProfileSchema.parse({ headline: "   ", city: "" });
    expect(parsed).toEqual({ headline: null, city: null });
  });
});

describe("sub-entitas karier (PR-038)", () => {
  it("tanggal harus YYYY-MM-DD dan benar-benar ada di kalender", () => {
    expect(dateOnlySchema.safeParse("2020-01-15").success).toBe(true);
    expect(dateOnlySchema.safeParse("15-01-2020").success).toBe(false);
    expect(dateOnlySchema.safeParse("2020-01-15T00:00:00Z").success).toBe(false);
    // 31 Februari LOLOS pengurai string ISO — ia tidak menjadi Invalid Date
    // melainkan bergeser diam-diam menjadi 3 Maret. Tanggal riwayat kerja yang
    // bergeser sendiri adalah kesalahan yang tidak pernah dilaporkan siapa pun.
    expect(dateOnlySchema.safeParse("2026-02-31").success).toBe(false);
    expect(dateOnlySchema.safeParse("2026-13-01").success).toBe(false);
    // Tahun kabisat tetap harus diterima — 2024 punya 29 Februari.
    expect(dateOnlySchema.safeParse("2024-02-29").success).toBe(true);
    expect(dateOnlySchema.safeParse("2023-02-29").success).toBe(false);
  });

  it("tanggal selesai tidak boleh mendahului tanggal mulai", () => {
    const salah = createExperienceSchema.safeParse({
      title: "Analis",
      startDate: "2022-01-01",
      endDate: "2021-12-31",
    });

    expect(salah.success).toBe(false);
    // Kesalahannya menempel pada field yang bisa diperbaiki pengguna, bukan
    // pada akar objek — form (PR-040) menampilkannya di bawah input yang tepat.
    expect(salah.success ? [] : salah.error.issues.map((i) => i.path.join("."))).toContain(
      "endDate",
    );
  });

  it("tanggal selesai boleh sama dengan tanggal mulai", () => {
    const sehari = createExperienceSchema.safeParse({
      title: "Proyek sehari",
      startDate: "2022-01-01",
      endDate: "2022-01-01",
    });

    expect(sehari.success).toBe(true);
  });

  it("field opsional yang tidak dikirim menjadi null, bukan undefined", () => {
    // Bentuk yang lahir dari POST harus sama dengan bentuk yang dibaca ulang,
    // supaya klien tidak perlu cabang untuk baris yang baru dibuat.
    expect(createExperienceSchema.parse({ title: "Analis" })).toEqual({
      title: "Analis",
      company: null,
      startDate: null,
      endDate: null,
      description: null,
    });
  });

  it("permintaan ubah kosong sah; field yang tidak disebut tetap tidak disebut", () => {
    // `{}` bukan "kosongkan semuanya" melainkan "jangan sentuh apa pun" —
    // itulah yang membuat simpan-per-bagian aman.
    expect(updateExperienceSchema.parse({})).toEqual({});
    expect(updateExperienceSchema.parse({ endDate: null })).toEqual({ endDate: null });
  });

  it("field asing ditolak, bukan dibuang diam-diam", () => {
    // Termasuk `userId` dan `id`: keduanya ditentukan server, dan badan
    // permintaan yang menyebutnya adalah percobaan menitipkan kepemilikan.
    expect(createSkillSchema.safeParse({ name: "SQL", userId: "x" }).success).toBe(false);
    expect(createSkillSchema.safeParse({ name: "SQL", id: "x" }).success).toBe(false);
  });

  it("teks wajib tidak boleh kosong maupun hanya spasi", () => {
    expect(createSkillSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createSkillSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createSkillSchema.parse({ name: "  SQL  " })).toEqual({ name: "SQL", level: null });
  });

  it("tahun pendidikan menerima perkiraan lulus, menolak yang mustahil", () => {
    // Batas atasnya bukan tahun ini: mahasiswa tingkat akhir mengisi perkiraan
    // lulus, dan menolaknya berarti ia tidak bisa menuliskan kuliahnya.
    expect(EDUCATION_YEAR_MAX).toBeGreaterThan(new Date().getUTCFullYear());
    for (const year of [EDUCATION_YEAR_MIN, EDUCATION_YEAR_MAX]) {
      expect(createEducationSchema.safeParse({ institution: "UI", year }).success).toBe(true);
    }
    for (const year of [EDUCATION_YEAR_MIN - 1, EDUCATION_YEAR_MAX + 1, 2020.5]) {
      expect(
        createEducationSchema.safeParse({ institution: "UI", year }).success,
        `year=${String(year)}`,
      ).toBe(false);
    }
  });

  it("event profile.updated tidak membawa satu pun isi profil", () => {
    // Payload yang menyalin data menjadi basi begitu ada mutasi berikutnya —
    // dan pelanggan yang memercayainya menghitung embedding dari keadaan yang
    // sudah tidak berlaku (PR-069).
    expect(Object.keys(profileUpdatedEventSchema.shape).sort()).toEqual([
      "section",
      "updatedAt",
      "userId",
    ]);
  });
});

describe("generator OpenAPI", () => {
  it("deterministik: dua kali generate menghasilkan byte identik", () => {
    expect(renderOpenApiJson()).toBe(renderOpenApiJson());
  });

  it("openapi.json ter-commit sinkron dengan skema (guard drift)", () => {
    const committed = readFileSync(resolve(pkgDir, "openapi.json"), "utf8");
    expect(committed).toBe(renderOpenApiJson());
  });

  it("dokumen memuat path contoh + components hasil ref", () => {
    const doc = buildOpenApiDocument();
    expect(Object.keys(doc.paths ?? {})).toContain("/auth/otp/request");
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(
      expect.arrayContaining(["RequestOtp", "RequestOtpResponse", "ErrorEnvelope"]),
    );
  });
});
