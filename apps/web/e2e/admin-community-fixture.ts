import type { CommunityMetrics, CommunityQueueReport } from "@nawasena/schemas";
import { COMMUNITY_UJI, COMMUNITY_POST_UJI } from "./community-fixture.js";
export const COMMUNITY_REPORT_UJI: CommunityQueueReport = {
  id: "01912345-89ab-7def-8123-4567890ace01",
  targetType: "post",
  targetId: COMMUNITY_POST_UJI.id,
  status: "open",
  reason: "Ada kata yang merendahkan anggota lain.",
  createdAt: COMMUNITY_UJI.createdAt,
  resolvedAt: null,
};
export const COMMUNITY_METRICS_UJI: CommunityMetrics = {
  periodDays: 30,
  from: "2026-09-06T06:00:00.000Z",
  to: "2026-10-06T06:00:00.000Z",
  newMemberships: 12,
  posts: 5,
  openReports: 1,
  closedReports: 2,
  averageResolutionSeconds: 7200,
};
