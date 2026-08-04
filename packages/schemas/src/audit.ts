// Kontrak audit bersama (SDD §8.3). Meta selalu allowlist: key di luar skema
// dibuang oleh Zod agar PII tidak pernah sampai ke audit_logs.
import { z } from "zod";
import { idSchema } from "./common.js";

export const AUDIT_ACTION = {
  AUTH_LOGIN_FAILED: "AUTH_LOGIN_FAILED",
  /** PR-017: login berhasil. Pasangan wajib AUTH_LOGIN_FAILED — tanpa jejak
   *  sukses, lonjakan kegagalan tidak punya pembanding saat investigasi. */
  AUTH_LOGIN_SUCCEEDED: "AUTH_LOGIN_SUCCEEDED",
  /** PR-018: refresh token yang SUDAH dicabut dipakai lagi — indikasi token
   *  dicuri. Aksi tersendiri, bukan AUTH_LOGIN_FAILED: ini bukan percobaan
   *  masuk yang salah kode, melainkan sinyal keamanan yang layak dialarmkan. */
  AUTH_REFRESH_REUSED: "AUTH_REFRESH_REUSED",
  PROFILE_SENSITIVE_READ: "PROFILE_SENSITIVE_READ",
  PROFILE_SENSITIVE_UPDATED: "PROFILE_SENSITIVE_UPDATED",
  APPLICATION_STATUS_CHANGED: "APPLICATION_STATUS_CHANGED",
  COMPANY_VERIFIED: "COMPANY_VERIFIED",
  ADMIN_RESOURCE_CHANGED: "ADMIN_RESOURCE_CHANGED",
  DATA_EXPORTED: "DATA_EXPORTED",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
} as const;

export const auditActionSchema = z.enum([
  AUDIT_ACTION.AUTH_LOGIN_FAILED,
  AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED,
  AUDIT_ACTION.AUTH_REFRESH_REUSED,
  AUDIT_ACTION.PROFILE_SENSITIVE_READ,
  AUDIT_ACTION.PROFILE_SENSITIVE_UPDATED,
  AUDIT_ACTION.APPLICATION_STATUS_CHANGED,
  AUDIT_ACTION.COMPANY_VERIFIED,
  AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
  AUDIT_ACTION.DATA_EXPORTED,
  AUDIT_ACTION.ACCOUNT_DELETED,
]);

export type AuditAction = z.infer<typeof auditActionSchema>;

/** Metode masuk — dipakai audit sukses & gagal. Bukan PII. */
const loginMethodSchema = z.enum(["otp", "google"]);

const sensitiveFieldSchema = z.enum(["disabilityTypes", "accommodationNeeds"]);
const applicationStatusSchema = z.enum([
  "submitted",
  "viewed",
  "in_review",
  "interview",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
]);

export const auditMetaSchemas: Record<AuditAction, z.AnyZodObject> = {
  // `reason` sengaja menyebut metodenya sendiri (prefiks `google*`) alih-alih
  // menambah field `method` wajib: field baru yang wajib akan membuat SELURUH
  // audit AUTH_LOGIN_FAILED lama (PR-016, tanpa field itu) ditolak sanitizer
  // dan hilang diam-diam. Menambah anggota enum bersifat additive.
  [AUDIT_ACTION.AUTH_LOGIN_FAILED]: z.object({
    reason: z.enum([
      "otpInvalid",
      "rateLimited",
      "accountLocked",
      /** Google menolak penukaran code (verifier PKCE salah, code hangus/terpakai). */
      "googleExchangeFailed",
      /** id_token gagal verifikasi: audience/issuer/kedaluwarsa/tanda tangan. */
      "googleTokenInvalid",
      /** Email Google belum terverifikasi — linking ditolak (anti-takeover). */
      "googleEmailNotVerified",
    ]),
  }),
  [AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED]: z.object({
    method: loginMethodSchema,
    isNewUser: z.boolean(),
  }),
  // Tanpa PII dan tanpa potongan token: yang berguna saat investigasi adalah
  // BERAPA sesi ikut tercabut, bukan nilai token yang memicunya.
  [AUDIT_ACTION.AUTH_REFRESH_REUSED]: z.object({
    /** Jumlah refresh token aktif yang ikut dicabut dalam keluarga itu. */
    revokedCount: z.number().int().min(0),
  }),
  [AUDIT_ACTION.PROFILE_SENSITIVE_READ]: z.object({
    purpose: z.enum(["selfService", "support", "matching", "disclosure"]),
    fields: z.array(sensitiveFieldSchema).min(1),
  }),
  [AUDIT_ACTION.PROFILE_SENSITIVE_UPDATED]: z.object({
    fields: z.array(sensitiveFieldSchema).min(1),
  }),
  [AUDIT_ACTION.APPLICATION_STATUS_CHANGED]: z.object({
    from: applicationStatusSchema,
    to: applicationStatusSchema,
  }),
  [AUDIT_ACTION.COMPANY_VERIFIED]: z.object({
    from: z.enum(["unverified", "selfClaimed", "verified"]),
    to: z.literal("verified"),
  }),
  [AUDIT_ACTION.ADMIN_RESOURCE_CHANGED]: z.object({
    operation: z.enum(["create", "update", "publish", "close", "moderate"]),
  }),
  [AUDIT_ACTION.DATA_EXPORTED]: z.object({
    format: z.literal("json"),
  }),
  [AUDIT_ACTION.ACCOUNT_DELETED]: z.object({
    stage: z.enum(["requested", "completed"]),
  }),
};

export const auditActorSchema = z.object({
  actorId: idSchema.nullable(),
  requestId: idSchema,
});

export type AuditActor = z.infer<typeof auditActorSchema>;

export const auditEntitySchema = z.string().trim().min(1).max(80);
export const auditEntityIdSchema = idSchema.nullable();
