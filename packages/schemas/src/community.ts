// PR-113: kontrak Community, SDD §5.4. Endpoint menyusul PR-114/116/118.
// Respons publik tidak memuat pelapor, profil sensitif, CV, atau lamaran.
import "zod-openapi/extend";
import { z } from "zod";
import {
  idSchema,
  paginationMetaSchema,
  paginationQuerySchema,
  timestampSchema,
} from "./common.js";

export const communityTypeSchema = z.enum(["topic", "city"]).openapi({ ref: "CommunityType" });
export const communityStatusSchema = z
  .enum(["active", "archived"])
  .openapi({ ref: "CommunityStatus" });
export const communityMembershipStatusSchema = z
  .enum(["active", "blocked"])
  .openapi({ ref: "CommunityMembershipStatus" });
export const communityContentStatusSchema = z
  .enum(["published", "hidden", "removed"])
  .openapi({ ref: "CommunityContentStatus" });
export const communityReportTargetTypeSchema = z
  .enum(["post", "comment"])
  .openapi({ ref: "CommunityReportTargetType" });
export const communityReportStatusSchema = z
  .enum(["open", "resolved", "rejected"])
  .openapi({ ref: "CommunityReportStatus" });
export const communityModerationActionSchema = z
  .enum(["hide", "restore", "remove"])
  .openapi({ ref: "CommunityModerationAction" });

export const COMMUNITY_CONTENT_LIMITS = { postMaxLength: 5000, commentMaxLength: 2000 } as const;

/** Plain text: normalize Unicode/newlines and discard C0/C1 controls.
 * Markup remains literal text; consumers render text, never HTML. NUL is rejected.
 */
export function sanitizeCommunityText(text: string): string {
  return Array.from(text.normalize("NFC").replace(/\r\n?/g, "\n"))
    .filter((c) => {
      const code = c.codePointAt(0)!;
      return (
        code === 0 || code === 9 || code === 10 || (code >= 32 && !(code >= 127 && code <= 159))
      );
    })
    .join("")
    .trim();
}

/** Server PR-116 dapat mengatur batas lebih ketat; klien memakai default yang sama. */
export function createCommunityContentSchemas(
  limits: { postMaxLength: number; commentMaxLength: number } = COMMUNITY_CONTENT_LIMITS,
) {
  const text = (max: number) =>
    z
      .string({ required_error: "Teks wajib diisi" })
      .trim()
      .min(1, { message: "Teks tidak boleh kosong" })
      .max(max, { message: `Teks maksimal ${max} karakter` })
      .refine((body) => !body.includes("\u0000"), {
        message: "Teks mengandung karakter yang tidak diizinkan",
      })
      .transform(sanitizeCommunityText)
      .openapi({ effectType: "same" })
      .refine((body) => body.length > 0, { message: "Teks tidak boleh kosong" });
  return {
    post: z.object({ body: text(limits.postMaxLength) }).strict(),
    comment: z.object({ body: text(limits.commentMaxLength) }).strict(),
  };
}

const content = createCommunityContentSchemas();
export const createCommunityPostSchema = content.post.openapi({ ref: "CreateCommunityPost" });
export const updateCommunityPostSchema = content.post.openapi({ ref: "UpdateCommunityPost" });
export const createCommunityCommentSchema = content.comment.openapi({
  ref: "CreateCommunityComment",
});
export const updateCommunityCommentSchema = content.comment.openapi({
  ref: "UpdateCommunityComment",
});

const roomFields = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: "Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung",
    }),
  name: z.string().trim().min(1, "Nama ruang wajib diisi").max(120),
  description: z.string().trim().min(1, "Deskripsi wajib diisi").max(2000),
  type: communityTypeSchema,
  city: z.string().trim().min(1, "Kota wajib diisi").max(120).nullable().optional(),
});

function checkCity(v: { type?: "topic" | "city"; city?: string | null }, ctx: z.RefinementCtx) {
  if (v.type === "city" && !v.city)
    ctx.addIssue({ code: "custom", path: ["city"], message: "Ruang kota wajib memiliki kota" });
  if (v.type === "topic" && v.city != null)
    ctx.addIssue({ code: "custom", path: ["city"], message: "Ruang topik tidak memiliki kota" });
}

export const createCommunitySchema = roomFields
  .strict()
  .superRefine(checkCity)
  .openapi({ ref: "CreateCommunity" });
// Jika type berubah, kota dikirim bersama. Service memeriksa patch terhadap row lama.
export const updateCommunitySchema = roomFields
  .extend({ status: communityStatusSchema })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan yang dikirim" })
  .superRefine(checkCity)
  .openapi({ ref: "UpdateCommunity" });

export const communityIdParamsSchema = z
  .object({ id: idSchema })
  .strict()
  .openapi({ ref: "CommunityIdParams" });
export const communitySlugParamsSchema = z
  .object({ slug: roomFields.shape.slug })
  .strict()
  .openapi({ ref: "CommunitySlugParams" });
export const emptyCommunityMutationSchema = z
  .object({})
  .strict()
  .openapi({ ref: "EmptyCommunityMutation" });
export const communityPostIdParamsSchema = z
  .object({ communityId: idSchema, postId: idSchema })
  .strict()
  .openapi({ ref: "CommunityPostIdParams" });
export const communityCommentIdParamsSchema = z
  .object({ communityId: idSchema, postId: idSchema, commentId: idSchema })
  .strict()
  .openapi({ ref: "CommunityCommentIdParams" });

export const communityListQuerySchema = paginationQuerySchema
  .extend({
    type: communityTypeSchema.optional(),
    city: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .openapi({ ref: "CommunityListQuery" });
export const communityFeedQuerySchema = paginationQuerySchema
  .extend({
    query: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .openapi({ ref: "CommunityFeedQuery" });
export const communityReportListQuerySchema = paginationQuerySchema
  .extend({ status: communityReportStatusSchema.optional() })
  .strict()
  .openapi({ ref: "CommunityReportListQuery" });

const reason = z
  .string()
  .trim()
  .min(1, "Alasan wajib diisi")
  .max(2000, "Alasan maksimal 2000 karakter")
  .refine((value) => !value.includes("\u0000"), "Alasan mengandung karakter yang tidak diizinkan")
  .transform(sanitizeCommunityText)
  .openapi({ effectType: "same" })
  .refine((value) => value.length > 0, "Alasan wajib diisi");
export const communityTargetParamsSchema = z
  .object({
    targetType: communityReportTargetTypeSchema,
    targetId: idSchema,
  })
  .strict()
  .openapi({ ref: "CommunityTargetParams" });
export const communityReasonInputSchema = z
  .object({ reason })
  .strict()
  .openapi({ ref: "CommunityReasonInput" });
export const communityModerationInputSchema = z
  .object({ action: communityModerationActionSchema, reason })
  .strict()
  .openapi({ ref: "CommunityModerationInput" });
export const communityModerationInfoSchema = z
  .object({
    action: communityModerationActionSchema,
    reason,
    createdAt: timestampSchema,
  })
  .strict()
  .openapi({ ref: "CommunityModerationInfo" });
export const createCommunityReportSchema = z
  .object({
    targetType: communityReportTargetTypeSchema,
    targetId: idSchema,
    reason,
  })
  .strict()
  .openapi({ ref: "CreateCommunityReport" });
export const moderateCommunityContentSchema = z
  .object({
    targetType: communityReportTargetTypeSchema,
    targetId: idSchema,
    action: communityModerationActionSchema,
    reason,
  })
  .strict()
  .openapi({ ref: "ModerateCommunityContent" });

export const communityMembershipSchema = z
  .object({
    communityId: idSchema,
    status: communityMembershipStatusSchema,
    joinedAt: timestampSchema,
  })
  .strict()
  .openapi({ ref: "CommunityMembership" });

export const communitySchema = roomFields
  .extend({
    id: idSchema,
    city: roomFields.shape.city.unwrap().unwrap().nullable(),
    status: communityStatusSchema,
    memberCount: z.number().int().nonnegative(),
    membershipStatus: communityMembershipStatusSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine(checkCity)
  .openapi({ ref: "Community" });

/** Identitas minimum; NULL ketika akun terhapus/dianonimkan. */
export const communityAuthorSchema = z
  .object({ id: idSchema, fullName: z.string() })
  .strict()
  .openapi({ ref: "CommunityAuthor" });
const contentFields = {
  id: idSchema,
  author: communityAuthorSchema.nullable(),
  // String kosong sah untuk tombstone PDP. Input tetap menolak body kosong.
  body: z.string(),
  status: communityContentStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  /** Only the author/admin receives the latest reason; never reporter identity. */
  moderation: communityModerationInfoSchema.nullable().optional(),
};
export const communityPostSchema = z
  .object({
    ...contentFields,
    communityId: idSchema,
    commentCount: z.number().int().nonnegative(),
  })
  .strict()
  .openapi({ ref: "CommunityPost" });
export const communityCommentSchema = z
  .object({ ...contentFields, postId: idSchema })
  .strict()
  .openapi({ ref: "CommunityComment" });

/** Receipt milik pelapor. Tidak memuat reporterId atau identitas admin. */
export const communityReportReceiptSchema = z
  .object({
    id: idSchema,
    targetType: communityReportTargetTypeSchema,
    targetId: idSchema,
    status: communityReportStatusSchema,
    createdAt: timestampSchema,
  })
  .strict()
  .openapi({ ref: "CommunityReportReceipt" });
/** Hanya antrean admin; tidak pernah disisipkan ke post/komentar. */
export const communityReportAdminSchema = communityReportReceiptSchema
  .extend({
    reason,
    reporterId: idSchema,
    resolvedBy: idSchema.nullable(),
    resolvedAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.status === "open" ? v.resolvedAt !== null || v.resolvedBy !== null : v.resolvedAt === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["resolvedAt"],
        message: "Waktu resolusi tidak sesuai status laporan",
      });
    }
  })
  .openapi({ ref: "CommunityReportAdmin" });

const single = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema }).strict();
const list = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: z.array(schema), meta: paginationMetaSchema }).strict();
export const communityResponseSchema = single(communitySchema).openapi({
  ref: "CommunityResponse",
});
export const communityListResponseSchema = list(communitySchema).openapi({
  ref: "CommunityListResponse",
});
export const communityMembershipResponseSchema = single(
  communityMembershipSchema.nullable(),
).openapi({ ref: "CommunityMembershipResponse" });
export const communityPostResponseSchema = single(communityPostSchema).openapi({
  ref: "CommunityPostResponse",
});
export const communityFeedResponseSchema = list(communityPostSchema).openapi({
  ref: "CommunityFeedResponse",
});
export const communityCommentResponseSchema = single(communityCommentSchema).openapi({
  ref: "CommunityCommentResponse",
});
export const communityCommentListResponseSchema = list(communityCommentSchema).openapi({
  ref: "CommunityCommentListResponse",
});
export const communityReportResponseSchema = single(communityReportReceiptSchema).openapi({
  ref: "CommunityReportResponse",
});
export const communityReportAdminListResponseSchema = list(communityReportAdminSchema).openapi({
  ref: "CommunityReportAdminListResponse",
});
export const communityReportAdminResponseSchema = single(communityReportAdminSchema).openapi({
  ref: "CommunityReportAdminResponse",
});
export const communityContentResponseSchema = single(
  z.discriminatedUnion("targetType", [
    z.object({ targetType: z.literal("post"), content: communityPostSchema }).strict(),
    z.object({ targetType: z.literal("comment"), content: communityCommentSchema }).strict(),
  ]),
).openapi({ ref: "CommunityContentResponse" });

/** Urutan eksplisit: namespace exports dapat berbeda antara tsx dan Vitest. */
export const communityOpenApiSchemas = {
  CommunityTargetParams: communityTargetParamsSchema,
  CommunityReasonInput: communityReasonInputSchema,
  CommunityModerationInput: communityModerationInputSchema,
  CommunityModerationInfo: communityModerationInfoSchema,
  CommunityContentResponse: communityContentResponseSchema,
  CommunityReportAdminResponse: communityReportAdminResponseSchema,
  CommunityType: communityTypeSchema,
  CommunityStatus: communityStatusSchema,
  CommunityMembershipStatus: communityMembershipStatusSchema,
  CommunityContentStatus: communityContentStatusSchema,
  CommunityReportTargetType: communityReportTargetTypeSchema,
  CommunityReportStatus: communityReportStatusSchema,
  CommunityModerationAction: communityModerationActionSchema,
  CreateCommunity: createCommunitySchema,
  UpdateCommunity: updateCommunitySchema,
  CommunityIdParams: communityIdParamsSchema,
  CommunitySlugParams: communitySlugParamsSchema,
  EmptyCommunityMutation: emptyCommunityMutationSchema,
  CommunityPostIdParams: communityPostIdParamsSchema,
  CommunityCommentIdParams: communityCommentIdParamsSchema,
  CommunityListQuery: communityListQuerySchema,
  CommunityFeedQuery: communityFeedQuerySchema,
  CommunityReportListQuery: communityReportListQuerySchema,
  CreateCommunityPost: createCommunityPostSchema,
  UpdateCommunityPost: updateCommunityPostSchema,
  CreateCommunityComment: createCommunityCommentSchema,
  UpdateCommunityComment: updateCommunityCommentSchema,
  CreateCommunityReport: createCommunityReportSchema,
  ModerateCommunityContent: moderateCommunityContentSchema,
  Community: communitySchema,
  CommunityMembership: communityMembershipSchema,
  CommunityAuthor: communityAuthorSchema,
  CommunityPost: communityPostSchema,
  CommunityComment: communityCommentSchema,
  CommunityReportReceipt: communityReportReceiptSchema,
  CommunityReportAdmin: communityReportAdminSchema,
  CommunityResponse: communityResponseSchema,
  CommunityListResponse: communityListResponseSchema,
  CommunityMembershipResponse: communityMembershipResponseSchema,
  CommunityPostResponse: communityPostResponseSchema,
  CommunityFeedResponse: communityFeedResponseSchema,
  CommunityCommentResponse: communityCommentResponseSchema,
  CommunityCommentListResponse: communityCommentListResponseSchema,
  CommunityReportResponse: communityReportResponseSchema,
  CommunityReportAdminListResponse: communityReportAdminListResponseSchema,
};

export type Community = z.infer<typeof communitySchema>;
export type CommunityMembership = z.infer<typeof communityMembershipSchema>;
export type CommunityPost = z.infer<typeof communityPostSchema>;
export type CommunityComment = z.infer<typeof communityCommentSchema>;
export type CommunityReportReceipt = z.infer<typeof communityReportReceiptSchema>;
export type CommunityReportAdmin = z.infer<typeof communityReportAdminSchema>;
export type CreateCommunity = z.infer<typeof createCommunitySchema>;
export type UpdateCommunity = z.infer<typeof updateCommunitySchema>;
export type CreateCommunityPost = z.infer<typeof createCommunityPostSchema>;
export type UpdateCommunityPost = z.infer<typeof updateCommunityPostSchema>;
export type CreateCommunityComment = z.infer<typeof createCommunityCommentSchema>;
export type UpdateCommunityComment = z.infer<typeof updateCommunityCommentSchema>;
export type CreateCommunityReport = z.infer<typeof createCommunityReportSchema>;
export type ModerateCommunityContent = z.infer<typeof moderateCommunityContentSchema>;
export type CommunityListQuery = z.infer<typeof communityListQuerySchema>;
export type CommunityFeedQuery = z.infer<typeof communityFeedQuerySchema>;
export type CommunityReportListQuery = z.infer<typeof communityReportListQuerySchema>;
export type CommunityType = z.infer<typeof communityTypeSchema>;
export type CommunityStatus = z.infer<typeof communityStatusSchema>;
export type CommunityMembershipStatus = z.infer<typeof communityMembershipStatusSchema>;
export type CommunityContentStatus = z.infer<typeof communityContentStatusSchema>;
export type CommunityReportTargetType = z.infer<typeof communityReportTargetTypeSchema>;
export type CommunityReportStatus = z.infer<typeof communityReportStatusSchema>;
export type CommunityModerationAction = z.infer<typeof communityModerationActionSchema>;
export type CommunityIdParams = z.infer<typeof communityIdParamsSchema>;
export type CommunityPostIdParams = z.infer<typeof communityPostIdParamsSchema>;
export type CommunityCommentIdParams = z.infer<typeof communityCommentIdParamsSchema>;
export type CommunityResponse = z.infer<typeof communityResponseSchema>;
export type CommunityListResponse = z.infer<typeof communityListResponseSchema>;
export type CommunityMembershipResponse = z.infer<typeof communityMembershipResponseSchema>;
export type CommunityPostResponse = z.infer<typeof communityPostResponseSchema>;
export type CommunityFeedResponse = z.infer<typeof communityFeedResponseSchema>;
export type CommunityCommentResponse = z.infer<typeof communityCommentResponseSchema>;
export type CommunityCommentListResponse = z.infer<typeof communityCommentListResponseSchema>;
export type CommunityReportResponse = z.infer<typeof communityReportResponseSchema>;
export type CommunityReportAdminListResponse = z.infer<
  typeof communityReportAdminListResponseSchema
>;
