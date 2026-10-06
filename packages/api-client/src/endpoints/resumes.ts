import {
  createResumeSchema,
  resumeListResponseSchema,
  resumePdfResponseSchema,
  resumeResponseSchema,
  updateResumeSchema,
  type CreateResume,
  type Resume,
  type ResumeSummary,
  type ResumePdfStatus,
  type UpdateResume,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";
import { ApiError, RESPONS_TIDAK_DIKENAL } from "../errors.js";

export const resumesKeys = {
  list: (sub: string | null) => queryKey("resumes", { sub: sub ?? "anonim" }),
  detail: (sub: string | null, id: string) => queryKey("resume", { id, sub: sub ?? "anonim" }),
  pdf: (sub: string | null, id: string) => queryKey("resume-pdf", { id, sub: sub ?? "anonim" }),
};

export async function listResumes(client: ApiClient): Promise<ResumeSummary[]> {
  const response = await client.request("/me/resumes", {
    responseSchema: resumeListResponseSchema,
  });
  return response.data;
}

export async function getResume(client: ApiClient, id: string): Promise<Resume> {
  const response = await client.request(`/me/resumes/${encodeURIComponent(id)}`, {
    responseSchema: resumeResponseSchema,
  });
  return response.data;
}

export async function createResume(client: ApiClient, input: CreateResume): Promise<Resume> {
  const response = await client.request("/me/resumes", {
    method: "POST",
    body: createResumeSchema.parse(input),
    responseSchema: resumeResponseSchema,
  });
  return response.data;
}

export async function updateResume(
  client: ApiClient,
  id: string,
  input: UpdateResume,
): Promise<Resume> {
  const response = await client.request(`/me/resumes/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: updateResumeSchema.parse(input),
    responseSchema: resumeResponseSchema,
  });
  return response.data;
}

export async function deleteResume(client: ApiClient, id: string): Promise<void> {
  await client.request(`/me/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getResumePdfStatus(client: ApiClient, id: string): Promise<ResumePdfStatus> {
  const response = await client.request(`/me/resumes/${encodeURIComponent(id)}/pdf`, {
    responseSchema: resumePdfResponseSchema,
  });
  return response.data;
}

export async function requestResumePdf(client: ApiClient, id: string): Promise<ResumePdfStatus> {
  const response = await client.request(`/me/resumes/${encodeURIComponent(id)}/pdf`, {
    method: "POST",
    responseSchema: resumePdfResponseSchema,
  });
  return response.data;
}

export async function downloadResumePdf(client: ApiClient, id: string): Promise<Uint8Array> {
  if (!client.download) throw new ApiError(RESPONS_TIDAK_DIKENAL, 0);
  const response = await client.download(`/me/resumes/${encodeURIComponent(id)}/pdf/download`);
  if (!response.headers.get("content-type")?.startsWith("application/pdf")) {
    throw new ApiError(RESPONS_TIDAK_DIKENAL, response.status);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 20_971_520 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    throw new ApiError(RESPONS_TIDAK_DIKENAL, response.status);
  }
  return bytes;
}
