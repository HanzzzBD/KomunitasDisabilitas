import "zod-openapi/extend";
import { z } from "zod";
import { paginationMetaSchema, timestampSchema } from "./common.js";
import {
  communityListQuerySchema,
  communityStatusSchema,
  communityReportReceiptSchema,
  communityReasonInputSchema,
} from "./community.js";

export const communityAdminListQuerySchema = communityListQuerySchema
  .extend({ status: communityStatusSchema.optional() })
  .strict()
  .openapi({ ref: "CommunityAdminListQuery" });
/** The moderation screen has no need for reporter/resolver identities. */
export const communityQueueReportSchema = communityReportReceiptSchema
  .extend({
    reason: communityReasonInputSchema.shape.reason,
    resolvedAt: timestampSchema.nullable(),
  })
  .strict()
  .openapi({ ref: "CommunityQueueReport" });
export const communityQueueResponseSchema = z
  .object({
    data: z.array(communityQueueReportSchema),
    meta: paginationMetaSchema,
  })
  .strict()
  .openapi({ ref: "CommunityQueueResponse" });
export const communityQueueDetailResponseSchema = z
  .object({
    data: communityQueueReportSchema,
  })
  .strict()
  .openapi({ ref: "CommunityQueueDetailResponse" });
export const communityMetricsSchema = z
  .object({
    periodDays: z.literal(30),
    from: timestampSchema,
    to: timestampSchema,
    newMemberships: z.number().int().nonnegative(),
    posts: z.number().int().nonnegative(),
    openReports: z.number().int().nonnegative(),
    closedReports: z.number().int().nonnegative(),
    averageResolutionSeconds: z.number().finite().nonnegative().nullable(),
  })
  .strict()
  .openapi({ ref: "CommunityMetrics" });
export const communityMetricsResponseSchema = z
  .object({ data: communityMetricsSchema })
  .strict()
  .openapi({ ref: "CommunityMetricsResponse" });
export type CommunityQueueReport = z.infer<typeof communityQueueReportSchema>;
export type CommunityMetrics = z.infer<typeof communityMetricsSchema>;
export type CommunityAdminListQuery = z.infer<typeof communityAdminListQuerySchema>;
export const communityAdminOpenApiSchemas = {
  CommunityAdminListQuery: communityAdminListQuerySchema,
  CommunityQueueReport: communityQueueReportSchema,
  CommunityQueueResponse: communityQueueResponseSchema,
  CommunityQueueDetailResponse: communityQueueDetailResponseSchema,
  CommunityMetrics: communityMetricsSchema,
  CommunityMetricsResponse: communityMetricsResponseSchema,
};
