import { describe, expect, it } from "vitest";
import {
  communityAdminListQuerySchema,
  communityQueueReportSchema,
  communityMetricsSchema,
  normalkanPath,
  analyticsPathSchema,
} from "../src/index.js";
const ID = "01912345-89ab-7def-8123-4567890ace01";
const TIME = "2026-10-06T06:00:00.000Z";
describe("PR-118 minimal admin contracts", () => {
  it("queue rejects unnecessary identity and sensitive data", () => {
    const row = {
      id: ID,
      targetType: "post",
      targetId: ID,
      status: "open",
      createdAt: TIME,
      reason: "Aturan",
      resolvedAt: null,
    };
    expect(communityQueueReportSchema.safeParse(row).success).toBe(true);
    for (const key of ["reporterId", "resolvedBy", "email", "phone", "resume", "disability"])
      expect(communityQueueReportSchema.safeParse({ ...row, [key]: ID }).success).toBe(false);
  });
  it("metrics are aggregate-only with nullable empty resolution and fixed 30 days", () => {
    const metrics = {
      periodDays: 30,
      from: TIME,
      to: TIME,
      newMemberships: 0,
      posts: 0,
      openReports: 0,
      closedReports: 0,
      averageResolutionSeconds: null,
    };
    expect(communityMetricsSchema.safeParse(metrics).success).toBe(true);
    expect(communityMetricsSchema.safeParse({ ...metrics, periodDays: 7 }).success).toBe(false);
    expect(communityMetricsSchema.safeParse({ ...metrics, userId: ID }).success).toBe(false);
  });
  it("admin room filters have a bounded status enum", () => {
    expect(communityAdminListQuerySchema.parse({ status: "archived" }).status).toBe("archived");
    expect(communityAdminListQuerySchema.safeParse({ status: "unknown" }).success).toBe(false);
  });
  it.each(["ruang", "laporan"])(
    "admin %s identifiers, including malformed IDs, never reach analytics",
    (section) => {
      for (const id of [ID, "nama-pribadi", "1234", "x@y.id"]) {
        const path = normalkanPath(`/admin/community/${section}/${id}?reason=private#body`);
        expect(path).toBe(`/admin/community/${section}/:id`);
        expect(analyticsPathSchema.safeParse(path).success).toBe(true);
      }
    },
  );
});
