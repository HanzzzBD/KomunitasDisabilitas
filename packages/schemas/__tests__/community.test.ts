import { describe, it, expect } from "vitest";
import {
  COMMUNITY_CONTENT_LIMITS,
  createCommunityContentSchemas,
  createCommunitySchema,
  updateCommunitySchema,
  createCommunityPostSchema,
  createCommunityCommentSchema,
  createCommunityReportSchema,
  moderateCommunityContentSchema,
  communityFeedQuerySchema,
  communityPostSchema,
  communityReportAdminSchema,
  communityReportReceiptSchema,
} from "../src/index.js";
import { buildOpenApiDocument } from "../src/openapi.js";

const id = "01912345-89ab-7def-8123-456789abcdef";
const at = "2026-10-06T09:00:00+07:00";
const room = { slug: "karier-jakarta", name: "Karier Jakarta", description: "Diskusi karier" };

describe("kontrak Community (PR-113)", () => {
  it("kota wajib pada ruang city dan tidak boleh hadir pada ruang topic", () => {
    expect(createCommunitySchema.safeParse({ ...room, type: "city" }).success).toBe(false);
    expect(createCommunitySchema.safeParse({ ...room, type: "city", city: "  " }).success).toBe(
      false,
    );
    expect(createCommunitySchema.parse({ ...room, type: "city", city: " Jakarta " }).city).toBe(
      "Jakarta",
    );
    expect(
      createCommunitySchema.safeParse({ ...room, type: "topic", city: "Jakarta" }).success,
    ).toBe(false);
    expect(createCommunitySchema.safeParse({ ...room, type: "topic" }).success).toBe(true);
    expect(updateCommunitySchema.safeParse({}).success).toBe(false);
    expect(updateCommunitySchema.parse({ status: "archived" })).toEqual({ status: "archived" });
  });

  it("input menolak penentuan author/status, media, dan nested reply oleh klien", () => {
    for (const extra of [
      { authorId: id },
      { status: "hidden" },
      { imageUrl: "https://example.com/a" },
    ]) {
      expect(createCommunityPostSchema.safeParse({ body: "Teks", ...extra }).success).toBe(false);
    }
    expect(
      createCommunityCommentSchema.safeParse({ body: "Balasan", parentCommentId: id }).success,
    ).toBe(false);
    expect(createCommunitySchema.safeParse({ ...room, type: "topic", createdBy: id }).success).toBe(
      false,
    );
  });

  it("teks kosong/NUL/terlalu panjang ditolak, default dan konfigurasi berbagi validasi", () => {
    for (const body of [
      "",
      " \n\t ",
      "a\u0000b",
      "x".repeat(COMMUNITY_CONTENT_LIMITS.postMaxLength + 1),
    ]) {
      expect(createCommunityPostSchema.safeParse({ body }).success).toBe(false);
    }
    expect(
      createCommunityPostSchema.parse({ body: "  Saya mencari kerja\n di Jakarta  " }).body,
    ).toBe("Saya mencari kerja\n di Jakarta");
    expect(
      createCommunityCommentSchema.safeParse({
        body: "x".repeat(COMMUNITY_CONTENT_LIMITS.commentMaxLength + 1),
      }).success,
    ).toBe(false);
    const smaller = createCommunityContentSchemas({ postMaxLength: 10, commentMaxLength: 5 });
    expect(smaller.post.safeParse({ body: "12345678901" }).success).toBe(false);
    expect(smaller.comment.safeParse({ body: "12345" }).success).toBe(true);
  });

  it("laporan/moderasi membutuhkan target sah dan alasan; pelapor tidak menentukan status", () => {
    expect(
      createCommunityReportSchema.parse({ targetType: "post", targetId: id, reason: " Spam " })
        .reason,
    ).toBe("Spam");
    for (const patch of [
      { targetType: "user" },
      { targetId: "salah" },
      { reason: " " },
      { reporterId: id },
      { status: "resolved" },
    ]) {
      expect(
        createCommunityReportSchema.safeParse({
          targetType: "post",
          targetId: id,
          reason: "Spam",
          ...patch,
        }).success,
      ).toBe(false);
    }
    expect(
      moderateCommunityContentSchema.safeParse({
        targetType: "comment",
        targetId: id,
        action: "hide",
        reason: " ",
      }).success,
    ).toBe(false);
  });

  it("tombstone PDP sah; respons publik menolak identitas pelapor dan data sensitif", () => {
    const post = {
      id,
      communityId: id,
      author: null,
      body: "",
      status: "removed",
      commentCount: 0,
      createdAt: at,
      updatedAt: at,
    };
    expect(communityPostSchema.safeParse(post).success).toBe(true);
    for (const extra of [
      { reporterId: id },
      { reports: [] },
      { disabilityTypes: [] },
      { resume: {} },
    ]) {
      expect(communityPostSchema.safeParse({ ...post, ...extra }).success).toBe(false);
    }
    const receipt = { id, targetType: "post", targetId: id, status: "open", createdAt: at };
    expect(communityReportReceiptSchema.safeParse({ ...receipt, reporterId: id }).success).toBe(
      false,
    );
    const report = {
      ...receipt,
      reason: "Spam",
      reporterId: id,
      resolvedBy: null,
      resolvedAt: null,
    };
    expect(communityReportAdminSchema.safeParse(report).success).toBe(true);
    expect(communityReportAdminSchema.safeParse({ ...report, status: "resolved" }).success).toBe(
      false,
    );
    // Resolver dihapus lewat PDP; waktu resolusi tetap utuh.
    expect(
      communityReportAdminSchema.safeParse({ ...report, status: "resolved", resolvedAt: at })
        .success,
    ).toBe(true);
  });

  it("feed memakai cursor dan batas halaman baku", () => {
    expect(communityFeedQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(communityFeedQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(
      communityFeedQuerySchema.parse({ cursor: "next", limit: "5", query: "  kerja  " }),
    ).toEqual({ cursor: "next", limit: 5, query: "kerja" });
  });

  it("OpenAPI memuat kontrak Community tanpa mendaftarkan route yang belum berjalan", () => {
    const document = buildOpenApiDocument();
    const schemas = document.components?.schemas ?? {};
    for (const name of [
      "CreateCommunity",
      "UpdateCommunity",
      "CreateCommunityPost",
      "CreateCommunityComment",
      "CreateCommunityReport",
      "CommunityFeedResponse",
      "CommunityReportAdminListResponse",
    ]) {
      expect(schemas).toHaveProperty(name);
    }
    expect(Object.keys(document.paths ?? {}).filter((path) => path.includes("communit"))).toEqual(
      [],
    );
  });
});
