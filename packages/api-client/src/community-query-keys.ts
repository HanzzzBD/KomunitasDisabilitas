import type {
  CommunityAdminListQuery,
  CommunityReportListQuery,
  CommunityReportTargetType,
} from "@nawasena/schemas";
import { queryKey } from "./query-keys.js";

// Dipakai shell untuk membersihkan cache saat sesi berubah. Kontrak endpoint
// Community tetap dimuat bersama halamannya, bukan saat aplikasi dibuka.
export const communityContentKeys = {
  all: () => queryKey("community-content"),
  feed: (userId: string, communityId: string) =>
    queryKey("community-content", { userId, communityId, kind: "feed" }),
  post: (userId: string, id: string) => queryKey("community-content", { userId, id, kind: "post" }),
  comment: (userId: string, id: string) =>
    queryKey("community-content", { userId, id, kind: "comment" }),
  comments: (userId: string, postId: string) =>
    queryKey("community-content", { userId, postId, kind: "comments" }),
};

export const communityAdminKeys = {
  all: () => queryKey("community-admin"),
  rooms: (userId: string, filter: Partial<CommunityAdminListQuery> = {}) =>
    ["community-admin", userId, "rooms", filter] as const,
  room: (userId: string, id: string) => ["community-admin", userId, "room", id] as const,
  queue: (userId: string, filter: Partial<CommunityReportListQuery> = {}) =>
    ["community-admin", userId, "queue", filter] as const,
  report: (userId: string, id: string) => ["community-admin", userId, "report", id] as const,
  content: (userId: string, type: CommunityReportTargetType, id: string) =>
    ["community-admin", userId, "content", type, id] as const,
  metrics: (userId: string) => ["community-admin", userId, "metrics"] as const,
};
