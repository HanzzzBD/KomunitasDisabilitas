// Domain: companies — perusahaan + verifikasi inklusivitas (PR-051, PRD FR-6.1).
//
// `accommodationNeedSchema`/`ACCOMMODATION_NEEDS` DIIMPOR dari profiles.ts, tidak
// diulang di sini. Komentar di profiles.ts sudah menyatakannya: "Nilai yang sama
// dipakai companies.accommodations_available dan jobs.accommodations" — satu
// taksonomi untuk tiga sisi, atau kebutuhan pencari kerja dan fasilitas
// perusahaan tidak akan pernah bisa dibandingkan sama sekali.
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema, successEnvelopeSchema, timestampSchema } from "./common.js";
import { accommodationNeedSchema } from "./profiles.js";

/**
 * Status verifikasi inklusivitas (Prisma `InclusivityStatus`, migrasi 03).
 *
 * NILAINYA SAMA PERSIS DENGAN ENUM DB (snake_case) — tidak seperti
 * `AUDIT_ACTION.COMPANY_VERIFIED` di audit.ts yang memakai "selfClaimed"
 * (camelCase). Keduanya ditulis PR yang berbeda dan TIDAK diseragamkan di sini
 * dengan sengaja: audit.ts sudah menjadi kontrak yang berlaku (skemanya
 * memvalidasi baris yang belum tentu belum pernah ditulis di lingkungan lain),
 * sedangkan status di sini adalah field DATA yang mengalir apa adanya dari
 * kolom `inclusivity_status` — memaksanya camelCase berarti setiap pembacaan
 * butuh pemetaan tanpa alasan selain konsistensi kosmetik. Satu-satunya tempat
 * kedua bentuk bertemu (`companies.service.ts`) memetakannya secara eksplisit
 * saat menulis audit `COMPANY_VERIFIED`.
 */
export const inclusivityStatusSchema = z
  .enum(["unverified", "self_claimed", "verified"])
  .openapi({ description: "Status verifikasi inklusivitas perusahaan" });

export type InclusivityStatus = z.infer<typeof inclusivityStatusSchema>;

/**
 * Status yang boleh ditulis langsung lewat PUT admin. `verified` SENGAJA tidak
 * termasuk: satu-satunya jalan menuju status itu adalah POST .../verify, yang
 * mewajibkan audit `COMPANY_VERIFIED` + event `company.verified`. Kalau PUT
 * ikut menerimanya, endpoint verifikasi kehilangan alasan untuk ada — status
 * publik "verified" bisa lahir tanpa jejak yang membedakannya dari sekadar
 * mengedit field lain.
 *
 * "Un-verify" (koreksi) TETAP mungkin lewat jalur ini: admin menuliskan
 * `unverified` atau `self_claimed` untuk perusahaan yang sebelumnya verified.
 */
export const editableInclusivityStatusSchema = z.enum(["unverified", "self_claimed"]);

export type EditableInclusivityStatus = z.infer<typeof editableInclusivityStatusSchema>;

const namaSchema = z
  .string()
  .trim()
  .min(1, { message: "Nama perusahaan wajib diisi" })
  .max(160, { message: "Nama perusahaan maksimal 160 karakter" });

const deskripsiSchema = z
  .string()
  .trim()
  .max(2000, { message: "Deskripsi maksimal 2000 karakter" })
  .nullable();

const websiteSchema = z
  .string()
  .trim()
  .url({ message: "Alamat website tidak valid" })
  .max(300, { message: "Alamat website maksimal 300 karakter" })
  .nullable();

const kotaSchema = z
  .string()
  .trim()
  .max(100, { message: "Nama kota maksimal 100 karakter" })
  .nullable();

/** Taksonomi akomodasi sebagai daftar tanpa duplikat — bentuk yang sama dipakai jobs.accommodations. */
const accommodationsAvailableSchema = z
  .array(accommodationNeedSchema)
  .max(accommodationNeedSchema.options.length, { message: "Terlalu banyak pilihan akomodasi" });

/**
 * Profil perusahaan PUBLIK — dilihat kandidat sebelum melamar (US-09, PR-054).
 *
 * TIDAK memuat `verifiedBy`: itu id admin internal, bukan informasi yang
 * berguna bagi kandidat, dan membocorkannya berarti membocorkan struktur akun
 * staf. `verifiedAt` ikut disertakan — "terverifikasi sejak kapan" adalah
 * bagian dari kepercayaan yang coba dibangun badge itu sendiri.
 */
export const companyPublicSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    description: z.string().nullable(),
    website: z.string().nullable(),
    city: z.string().nullable(),
    inclusivityStatus: inclusivityStatusSchema,
    accommodationsAvailable: z.array(accommodationNeedSchema),
    verifiedAt: timestampSchema.nullable(),
  })
  .openapi({ ref: "CompanyPublic", description: "Profil perusahaan (tampilan publik)" });

export type CompanyPublic = z.infer<typeof companyPublicSchema>;

/**
 * Profil perusahaan lengkap — hanya untuk admin. Menambah `verifiedBy` dan
 * timestamp administratif yang tidak pernah diekspos ke `companyPublicSchema`.
 */
export const companyAdminSchema = companyPublicSchema
  .extend({
    verifiedBy: idSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .openapi({ ref: "CompanyAdmin", description: "Profil perusahaan (tampilan admin)" });

export type CompanyAdmin = z.infer<typeof companyAdminSchema>;

export const companyIdParamsSchema = z
  .object({ id: idSchema })
  .openapi({ ref: "CompanyIdParams" });

export type CompanyIdParams = z.infer<typeof companyIdParamsSchema>;

/** POST /api/v1/admin/companies — status verifikasi selalu lahir `unverified`. */
export const createCompanySchema = z
  .object({
    name: namaSchema,
    description: deskripsiSchema.default(null),
    website: websiteSchema.default(null),
    city: kotaSchema.default(null),
    accommodationsAvailable: accommodationsAvailableSchema.default([]),
  })
  .strict()
  .openapi({ ref: "CreateCompany" });

export type CreateCompany = z.infer<typeof createCompanySchema>;

/**
 * PUT /api/v1/admin/companies/:id — seluruh field opsional (patch sebagian),
 * kecuali `inclusivityStatus` yang membatasi nilainya sendiri (lihat komentar
 * `editableInclusivityStatusSchema` di atas).
 */
export const updateCompanySchema = z
  .object({
    name: namaSchema,
    description: deskripsiSchema,
    website: websiteSchema,
    city: kotaSchema,
    accommodationsAvailable: accommodationsAvailableSchema,
    inclusivityStatus: editableInclusivityStatusSchema,
  })
  .partial()
  .strict()
  .openapi({ ref: "UpdateCompany" });

export type UpdateCompany = z.infer<typeof updateCompanySchema>;

export const companyPublicResponseSchema = successEnvelopeSchema(companyPublicSchema);
export const companyAdminResponseSchema = successEnvelopeSchema(companyAdminSchema);
/** GET /api/v1/admin/companies — daftar penuh, tanpa pagination (skala pilot, puluhan baris). */
export const companyAdminListResponseSchema = successEnvelopeSchema(z.array(companyAdminSchema));

/**
 * Event domain `company.verified` (SDD §3.2). TIDAK memuat isi profil
 * perusahaan — pelanggan yang membutuhkannya membaca dari modul `companies`,
 * sama seperti alasan `jobClosedEventSchema` di jobs.ts tidak membawa salinan
 * data.
 *
 * SENGAJA tanpa `.openapi({ ref })`: event domain, bukan kontrak HTTP.
 */
export const companyVerifiedEventSchema = z.object({
  companyId: idSchema,
  verifiedBy: idSchema,
  verifiedAt: timestampSchema,
});

export type CompanyVerifiedEvent = z.infer<typeof companyVerifiedEventSchema>;
