// Endpoint AI (PR-043 kuota; PR-065..068 AI CV Builder).
//
// Dua jalur berbeda di berkas ini, dan bedanya disengaja:
//   - JSON biasa (`request`) untuk kuota, sesi, dan finalize.
//   - ALIRAN (`stream`) untuk jawaban pewawancara: fungsi di sini hanya MEMBUKA
//     aliran dan menyerahkan event mentah; menafsirkan event (giliran, token,
//     penutup, sambung ulang) adalah urusan pemakainya — di web `useAiStream`.
//     Pemisahan itu yang membuat klien mobile bisa memakai pembuka yang sama
//     dengan mesin keadaan yang berbeda.
import {
  aiChatSessionResponseSchema,
  aiCvChatFinalizeResponseSchema,
  aiCvChatRequestSchema,
  aiQuotaResponseSchema,
  aiSimplifyTextRequestSchema,
  aiSimplifyTextResponseSchema,
  type AiChatSession,
  type AiCvChatFinalizeResult,
  type AiCvChatRequest,
  type AiQuotaSummary,
  type AiSimplifyTextRequest,
  type AiSimplifyTextResult,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { ApiError } from "../errors.js";
import { queryKey } from "../query-keys.js";
import { uraiSse, type AliranByte, type EventSse } from "../sse.js";

export const aiKeys = {
  kuota: (sub: string | null) => queryKey("ai-kuota", { sub: sub ?? "anonim" }),
  sesiChat: (sub: string | null) => queryKey("ai-cv-chat", { sub: sub ?? "anonim" }),
};

export async function getAiQuota(client: ApiClient): Promise<AiQuotaSummary> {
  const response = await client.request("/ai/quota", { responseSchema: aiQuotaResponseSchema });
  return response.data;
}

/** Mulai atau lanjutkan SATU sesi aktif — sesi baru sudah berisi salam pembuka. */
export async function startAiChatSession(client: ApiClient): Promise<AiChatSession> {
  const response = await client.request("/ai/cv-chat/sessions", {
    method: "POST",
    responseSchema: aiChatSessionResponseSchema,
  });
  return response.data;
}

export async function getAiChatSession(client: ApiClient, id: string): Promise<AiChatSession> {
  const response = await client.request(`/ai/cv-chat/${encodeURIComponent(id)}`, {
    responseSchema: aiChatSessionResponseSchema,
  });
  return response.data;
}

export async function finalizeAiChatSession(
  client: ApiClient,
  id: string,
): Promise<AiCvChatFinalizeResult> {
  const response = await client.request(`/ai/cv-chat/${encodeURIComponent(id)}/finalize`, {
    method: "POST",
    responseSchema: aiCvChatFinalizeResponseSchema,
  });
  return response.data;
}

/**
 * Sederhanakan satu bagian lowongan (PR-087). Memotong satu jatah
 * `simplify_text` — karena itu POST/mutasi, bukan query yang boleh diulang
 * diam-diam saat fokus jendela kembali.
 *
 * Degradasi BUKAN error: `alasan` terisi dan `teks` null. Yang dilempar hanya
 * kegagalan non-AI (404 lowongan, 401 sesi, jaringan).
 */
export async function simplifyText(
  client: ApiClient,
  body: AiSimplifyTextRequest,
): Promise<AiSimplifyTextResult> {
  const response = await client.request("/ai/simplify-text", {
    method: "POST",
    body: aiSimplifyTextRequestSchema.parse(body),
    responseSchema: aiSimplifyTextResponseSchema,
  });
  return response.data;
}

function pastikanStream(client: ApiClient): NonNullable<ApiClient["stream"]> {
  if (client.stream === undefined) {
    throw new ApiError(
      {
        code: "ALIRAN_TIDAK_DIDUKUNG",
        message: "Aplikasi ini belum bisa menerima jawaban bertahap",
        hint: "Muat ulang halaman, atau isi CV lewat formulir biasa",
      },
      0,
    );
  }
  return client.stream.bind(client);
}

/** Response → event SSE. Badan kosong (jarang, proxy aneh) = aliran kosong. */
function keEvent(response: Response): AsyncGenerator<EventSse> {
  const body = response.body as AliranByte | null;
  if (body === null) return (async function* kosong() {})();
  return uraiSse(body);
}

/**
 * Kirim satu pesan; kembalikan aliran event mentah. Penolakan pra-aliran (404,
 * 409, 503, 401 setelah refresh) dilempar sebagai `ApiError` SEBELUM iterasi.
 */
export async function streamAiChat(
  client: ApiClient,
  input: AiCvChatRequest,
  signal?: AbortSignal,
): Promise<AsyncGenerator<EventSse>> {
  const response = await pastikanStream(client)("/ai/cv-chat", {
    method: "POST",
    body: aiCvChatRequestSchema.parse(input),
    ...(signal === undefined ? {} : { signal }),
  });
  return keEvent(response);
}

/** Sambung ulang aliran sesi dengan `Last-Event-Id`; 404 = tidak ada lagi yang bisa disambung. */
export async function resumeAiChatStream(
  client: ApiClient,
  sessionId: string,
  lastEventId: number,
  signal?: AbortSignal,
): Promise<AsyncGenerator<EventSse>> {
  const response = await pastikanStream(client)(
    `/ai/cv-chat/${encodeURIComponent(sessionId)}/stream`,
    {
      headers: { "last-event-id": String(lastEventId) },
      ...(signal === undefined ? {} : { signal }),
    },
  );
  return keEvent(response);
}
