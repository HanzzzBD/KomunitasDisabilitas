import type { ZodOpenApiPathItemObject } from "zod-openapi";
import {
  communityFeedQuerySchema,
  communityFeedResponseSchema,
  communityIdParamsSchema,
  communityListQuerySchema,
  communityListResponseSchema,
  communityMembershipResponseSchema,
  communityResponseSchema,
  communitySlugParamsSchema,
  createCommunitySchema,
  emptyCommunityMutationSchema,
  updateCommunitySchema,
} from "./community.js";
import { errorEnvelopeSchema } from "./common.js";
import type { z } from "zod";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: errorEnvelopeSchema } },
});
const ok = (schema: z.ZodTypeAny, description = "Berhasil") => ({
  description,
  content: { "application/json": { schema } },
});
const body = (schema: z.ZodTypeAny) => ({
  required: true,
  content: { "application/json": { schema } },
});
const limits = {
  "429": error("Batas permintaan Community tercapai; Retry-After dalam detik"),
  "503": error("Layanan Community atau sesi belum tersedia"),
};
const session = { "401": error("Belum masuk atau akun tidak aktif"), ...limits };
const admin = { ...session, "403": error("Hanya admin") };
const missing = {
  "404": error("Ruang tidak ditemukan"),
  "400": error("Input atau cursor tidak valid"),
};

export const communityPaths: Record<string, ZodOpenApiPathItemObject> = {
  "/communities": {
    get: {
      operationId: "listCommunities",
      tags: ["community"],
      summary: "Telusuri ruang aktif (publik)",
      security: [],
      description:
        "Filter jenis/kota. Urutan createdAt DESC, id DESC; cursor dari meta.nextCursor. membershipStatus null pada respons publik; GET membership membaca status pemilik sesi.",
      requestParams: { query: communityListQuerySchema },
      responses: {
        "200": ok(communityListResponseSchema),
        "400": error("Query/cursor tidak valid"),
        ...limits,
      },
    },
  },
  "/communities/{slug}": {
    get: {
      operationId: "getCommunity",
      tags: ["community"],
      summary: "Deskripsi ruang berdasarkan slug (publik)",
      security: [],
      description:
        "Ruang arsip tetap terlihat dari tautan lama; tidak ada isi post atau daftar identitas anggota.",
      requestParams: { path: communitySlugParamsSchema },
      responses: { "200": ok(communityResponseSchema), ...missing, ...limits },
    },
  },
  "/communities/{id}/membership": {
    get: {
      operationId: "getMyCommunityMembership",
      tags: ["community"],
      summary: "Keanggotaan pemilik sesi",
      requestParams: { path: communityIdParamsSchema },
      responses: { "200": ok(communityMembershipResponseSchema), ...missing, ...session },
    },
    delete: {
      operationId: "leaveCommunity",
      tags: ["community"],
      summary: "Keluar ruang secara idempotent",
      description:
        "Hanya membership pemilik sesi. Tetap boleh keluar ruang arsip. Marker blocked dipertahankan dan dijawab 403 agar leave/join tidak membatalkan blokir.",
      requestParams: { path: communityIdParamsSchema },
      requestBody: { ...body(emptyCommunityMutationSchema), required: false },
      responses: {
        "200": ok(
          communityMembershipResponseSchema,
          "data null; keanggotaan aktif sudah tidak ada",
        ),
        "403": error("Membership diblokir"),
        ...missing,
        ...session,
      },
    },
  },
  "/communities/{id}/join": {
    post: {
      operationId: "joinCommunity",
      tags: ["community"],
      summary: "Bergabung ruang aktif secara idempotent",
      description:
        "Tidak menerima userId. Join ulang mempertahankan joinedAt dan tidak menerbitkan event tambahan. Semua role memiliki aturan keanggotaan yang sama.",
      requestParams: { path: communityIdParamsSchema },
      requestBody: { ...body(emptyCommunityMutationSchema), required: false },
      responses: {
        "200": ok(communityMembershipResponseSchema),
        "403": error("Membership diblokir"),
        "409": error("Ruang sudah diarsipkan"),
        ...missing,
        ...session,
      },
    },
  },
  "/communities/{id}/posts": {
    get: {
      operationId: "getCommunityFeed",
      tags: ["community"],
      summary: "Baca feed diskusi dengan sesi",
      description:
        "Tidak wajib join. Hanya published, termasuk bagi admin/employer; hidden/removed tidak bocor. Ruang arsip tetap dapat dibaca. Pencarian teks penuh bahasa Indonesia; urutan createdAt DESC, id DESC. Penulis hanya id/fullName atau null; jumlah komentar hanya published.",
      requestParams: { path: communityIdParamsSchema, query: communityFeedQuerySchema },
      responses: { "200": ok(communityFeedResponseSchema), ...missing, ...session },
    },
  },
  "/admin/communities": {
    get: {
      operationId: "listCommunitiesAdmin",
      tags: ["community"],
      summary: "Daftar ruang aktif dan arsip (admin)",
      requestParams: { query: communityListQuerySchema },
      responses: {
        "200": ok(communityListResponseSchema),
        "400": error("Query/cursor tidak valid"),
        ...admin,
      },
    },
    post: {
      operationId: "createCommunity",
      tags: ["community"],
      summary: "Buat ruang (admin)",
      requestBody: body(createCommunitySchema),
      responses: {
        "201": ok(communityResponseSchema, "Ruang aktif dibuat"),
        "400": error("Input tidak valid"),
        "409": error("Slug sudah dipakai"),
        ...admin,
      },
    },
  },
  "/admin/communities/{id}": {
    get: {
      operationId: "getCommunityAdmin",
      tags: ["community"],
      summary: "Detail ruang berdasarkan ID (admin)",
      requestParams: { path: communityIdParamsSchema },
      responses: { "200": ok(communityResponseSchema), ...missing, ...admin },
    },
    patch: {
      operationId: "updateCommunity",
      tags: ["community"],
      summary: "Ubah atau aktifkan kembali ruang (admin)",
      requestParams: { path: communityIdParamsSchema },
      requestBody: body(updateCommunitySchema),
      responses: {
        "200": ok(communityResponseSchema),
        "409": error("Slug sudah dipakai"),
        ...missing,
        ...admin,
      },
    },
    delete: {
      operationId: "archiveCommunity",
      tags: ["community"],
      summary: "Arsipkan ruang tanpa menghapus diskusi (admin)",
      requestParams: { path: communityIdParamsSchema },
      requestBody: { ...body(emptyCommunityMutationSchema), required: false },
      responses: { "200": ok(communityResponseSchema), ...missing, ...admin },
    },
  },
};
