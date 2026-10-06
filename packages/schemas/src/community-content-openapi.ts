import type { ZodOpenApiPathItemObject } from "zod-openapi";
import type { z } from "zod";
import { errorEnvelopeSchema, paginationQuerySchema } from "./common.js";
import {
  communityIdParamsSchema,
  communityTargetParamsSchema,
  communityReasonInputSchema,
  communityModerationInputSchema,
  communityPostResponseSchema,
  communityCommentResponseSchema,
  communityCommentListResponseSchema,
  communityReportResponseSchema,
  communityReportAdminListResponseSchema,
  communityReportAdminResponseSchema,
  communityReportListQuerySchema,
  communityContentResponseSchema,
  createCommunityPostSchema,
  updateCommunityPostSchema,
  createCommunityCommentSchema,
  updateCommunityCommentSchema,
  emptyCommunityMutationSchema,
} from "./community.js";
const json = (schema: z.ZodTypeAny) => ({ "application/json": { schema } });
const response = (schema: z.ZodTypeAny, description = "Berhasil") => ({
  description,
  content: json(schema),
});
const errors = {
  "400": response(errorEnvelopeSchema, "Input atau cursor tidak valid"),
  "401": response(errorEnvelopeSchema, "Belum masuk atau akun tidak aktif"),
  "403": response(errorEnvelopeSchema, "Role atau keanggotaan tidak berhak"),
  "404": response(errorEnvelopeSchema, "Konten tidak ditemukan atau tidak dapat diakses"),
  "409": response(errorEnvelopeSchema, "Arsip, konten removed, atau laporan sudah ditutup"),
  "429": response(errorEnvelopeSchema, "Kuota tercapai; Retry-After dalam detik"),
  "503": response(errorEnvelopeSchema, "Layanan sementara tidak tersedia"),
};
function operation(
  id: string,
  summary: string,
  params: z.AnyZodObject,
  output: z.ZodTypeAny,
  input?: z.ZodTypeAny,
  description?: string,
  created = false,
) {
  return {
    operationId: id,
    tags: ["community"],
    summary,
    ...(description ? { description } : {}),
    requestParams: { path: params },
    ...(input
      ? { requestBody: { required: input !== emptyCommunityMutationSchema, content: json(input) } }
      : {}),
    responses: { [created ? "201" : "200"]: response(output), ...errors },
  };
}
const writePolicy =
  "Anggota aktif ruang aktif, termasuk semua role. Teks literal tanpa HTML; Unicode/newline dinormalkan dan kontrol non-printing dibuang. Default post 5000/komentar 2000 karakter, konfigurasi server boleh lebih ketat. Bucket create per user terpisah dari report.";
const ownPolicy =
  "Hanya penulis. Edit konten hidden tetap hidden; removed final. Hapus sendiri mengosongkan body, boleh setelah keluar/blokir/arsip. Respons pemilik memuat alasan moderasi terakhir tanpa identitas pelapor/admin.";
export const communityContentPaths: Record<string, ZodOpenApiPathItemObject> = {
  "/communities/{id}/posts": {
    post: operation(
      "createCommunityPost",
      "Buat post teks",
      communityIdParamsSchema,
      communityPostResponseSchema,
      createCommunityPostSchema,
      writePolicy,
      true,
    ),
  },
  "/community-posts/{id}": {
    get: operation(
      "getCommunityPost",
      "Baca post",
      communityIdParamsSchema,
      communityPostResponseSchema,
      undefined,
      "Sesi wajib tanpa perlu join. Published dapat dibaca semua akun; hidden/removed hanya pemilik lewat endpoint ini. Removed selalu mengosongkan body; admin memakai endpoint terpisah.",
    ),
    patch: operation(
      "updateCommunityPost",
      "Sunting post sendiri",
      communityIdParamsSchema,
      communityPostResponseSchema,
      updateCommunityPostSchema,
      ownPolicy,
    ),
    delete: operation(
      "deleteCommunityPost",
      "Hapus teks post sendiri",
      communityIdParamsSchema,
      communityPostResponseSchema,
      emptyCommunityMutationSchema,
      ownPolicy,
    ),
  },
  "/community-posts/{id}/comments": {
    get: {
      ...operation(
        "listCommunityComments",
        "Komentar published pada post published",
        communityIdParamsSchema,
        communityCommentListResponseSchema,
        undefined,
        "Sesi wajib; urutan createdAt ASC/id ASC; cursor, tanpa nested reply.",
      ),
      requestParams: { path: communityIdParamsSchema, query: paginationQuerySchema },
    },
    post: operation(
      "createCommunityComment",
      "Balas post satu tingkat",
      communityIdParamsSchema,
      communityCommentResponseSchema,
      createCommunityCommentSchema,
      writePolicy,
      true,
    ),
  },
  "/community-comments/{id}": {
    get: operation(
      "getCommunityComment",
      "Baca komentar atau status konten sendiri",
      communityIdParamsSchema,
      communityCommentResponseSchema,
    ),
    patch: operation(
      "updateCommunityComment",
      "Sunting komentar sendiri",
      communityIdParamsSchema,
      communityCommentResponseSchema,
      updateCommunityCommentSchema,
      ownPolicy,
    ),
    delete: operation(
      "deleteCommunityComment",
      "Hapus teks komentar sendiri",
      communityIdParamsSchema,
      communityCommentResponseSchema,
      emptyCommunityMutationSchema,
      ownPolicy,
    ),
  },
  "/community-content/{targetType}/{targetId}/reports": {
    post: {
      ...operation(
        "reportCommunityContent",
        "Laporkan konten published",
        communityTargetParamsSchema,
        communityReportResponseSchema,
        communityReasonInputSchema,
        "Semua akun login, termasuk belum join/blocked. Identitas/reason pelapor tidak pernah ikut respons konten. Duplikat laporan open milik akun yang sama mengembalikan receipt yang sama (200), tanpa event kedua. Arsip tetap dapat dilaporkan.",
        true,
      ),
      responses: {
        "201": response(communityReportResponseSchema),
        "200": response(communityReportResponseSchema, "Receipt laporan open sebelumnya"),
        ...errors,
      },
    },
  },
  "/admin/community-content/{targetType}/{targetId}": {
    get: operation(
      "getAdminCommunityContent",
      "Admin membaca target termasuk hidden/removed",
      communityTargetParamsSchema,
      communityContentResponseSchema,
      undefined,
      "Admin-only; tidak memuat profil sensitif/CV/lamaran. Body removed oleh admin tetap disimpan; body self-delete/PDP kosong.",
    ),
  },
  "/admin/community-content/{targetType}/{targetId}/moderate": {
    post: operation(
      "moderateCommunityContent",
      "Hide, restore, atau remove dengan alasan wajib",
      communityTargetParamsSchema,
      communityContentResponseSchema,
      communityModerationInputSchema,
      "Admin-only. Status, audit wajib, dan resolusi semua laporan open target di-commit atomik. Hide/remove menutup laporan resolved, termasuk konten yang sudah dihapus penulis. Removed final, tidak bisa restore. Aksi yang status dan resolusi laporannya sudah tercapai idempotent dan tidak mengulang event/notifikasi.",
    ),
  },
  "/admin/community-reports": {
    get: {
      operationId: "listAdminCommunityReports",
      tags: ["community"],
      summary: "Antrean laporan admin",
      description:
        "Admin-only; data minimum dan filter status. Urutan createdAt ASC/id ASC, cursor. Pelapor tidak ditampilkan kepada pemilik konten.",
      requestParams: { query: communityReportListQuerySchema },
      responses: { "200": response(communityReportAdminListResponseSchema), ...errors },
    },
  },
  "/admin/community-reports/{id}/reject": {
    post: operation(
      "rejectCommunityReport",
      "Tolak laporan dengan alasan wajib",
      communityIdParamsSchema,
      communityReportAdminResponseSchema,
      communityReasonInputSchema,
      "Admin-only; penolakan dan audit wajib atomik. Hanya laporan open; laporan yang sudah ditutup menjawab 409. Tidak mengubah konten.",
    ),
  },
};
