// Endpoint kamus video BISINDO admin (PR-084/085a di server; dikonsumsi PR-085b).
//
// Pola sama `jobs.ts`: daftar, buat, ubah, terbitkan, dan tarik adalah satu
// layar admin (`/admin/kamus`). Tidak ada GET satu entri — server tidak
// menyediakannya; mode ubah mencari barisnya dari `listSignVideosAdmin`.
//
// UNGGAHAN BERKAS TIDAK LEWAT KLIEN INI. `presignSignVideoMedia` hanya meminta
// izin; byte-nya dikirim browser LANGSUNG ke bucket (PUT presigned) supaya
// video 50 MB tidak melewati API. Pengirimnya hidup di aplikasi web, karena
// progres unggah butuh XMLHttpRequest — `fetch` tidak melaporkannya.
import {
  createSignVideoSchema,
  signVideoAdminListResponseSchema,
  signVideoAdminResponseSchema,
  signVideoPresignResponseSchema,
  signVideoPresignSchema,
  updateSignVideoSchema,
  type SignVideoAdmin,
  type SignVideoPresignResult,
} from "@nawasena/schemas";
import type { z } from "zod";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/** Key cache TanStack — TANPA params, sama alasannya dengan `jobsKeys.adminList`. */
export const signVideosKeys = {
  adminList: () => queryKey("admin-sign-videos"),
};

/** Bentuk MASUKAN skema (`z.input`), sama alasannya dengan `jobs.ts`. */
export type BuatEntriKamus = z.input<typeof createSignVideoSchema>;
export type UbahEntriKamus = z.input<typeof updateSignVideoSchema>;
export type IzinUnggahKamus = z.input<typeof signVideoPresignSchema>;

/** GET /api/v1/admin/sign-videos — seluruh entri (draft + terbit), tanpa pagination. */
export async function listSignVideosAdmin(client: ApiClient): Promise<SignVideoAdmin[]> {
  const res = await client.request("/admin/sign-videos", {
    responseSchema: signVideoAdminListResponseSchema,
  });
  return res.data;
}

/** POST /api/v1/admin/sign-videos — entri selalu lahir `draft`, tanpa media. */
export async function createSignVideoAdmin(
  client: ApiClient,
  input: BuatEntriKamus,
): Promise<SignVideoAdmin> {
  const res = await client.request("/admin/sign-videos", {
    method: "POST",
    body: createSignVideoSchema.parse(input),
    responseSchema: signVideoAdminResponseSchema,
  });
  return res.data;
}

/**
 * PUT /api/v1/admin/sign-videos/:id — perubahan SEBAGIAN, termasuk key media
 * hasil unggahan. Server memeriksa objeknya sudah ada di bucket (422 bila belum).
 */
export async function updateSignVideoAdmin(
  client: ApiClient,
  id: string,
  input: UbahEntriKamus,
): Promise<SignVideoAdmin> {
  const res = await client.request(`/admin/sign-videos/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: updateSignVideoSchema.parse(input),
    responseSchema: signVideoAdminResponseSchema,
  });
  return res.data;
}

/** POST /api/v1/admin/sign-videos/:id/publish — 422 bila video/caption/transkrip belum ada. */
export async function publishSignVideoAdmin(
  client: ApiClient,
  id: string,
): Promise<SignVideoAdmin> {
  const res = await client.request(`/admin/sign-videos/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    responseSchema: signVideoAdminResponseSchema,
  });
  return res.data;
}

/** POST /api/v1/admin/sign-videos/:id/unpublish — terbit → draft; media tetap utuh. */
export async function unpublishSignVideoAdmin(
  client: ApiClient,
  id: string,
): Promise<SignVideoAdmin> {
  const res = await client.request(`/admin/sign-videos/${encodeURIComponent(id)}/unpublish`, {
    method: "POST",
    responseSchema: signVideoAdminResponseSchema,
  });
  return res.data;
}

/**
 * POST /api/v1/admin/sign-videos/presign — izin unggah SATU berkas. Tipe &
 * ukuran divalidasi di sini lebih dulu (skema yang sama dengan server), jadi
 * berkas yang pasti ditolak tidak pernah memakan satu permintaan pun.
 */
export async function presignSignVideoMedia(
  client: ApiClient,
  input: IzinUnggahKamus,
): Promise<SignVideoPresignResult> {
  const res = await client.request("/admin/sign-videos/presign", {
    method: "POST",
    body: signVideoPresignSchema.parse(input),
    responseSchema: signVideoPresignResponseSchema,
  });
  return res.data;
}
