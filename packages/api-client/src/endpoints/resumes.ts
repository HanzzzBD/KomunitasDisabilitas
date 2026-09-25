import {
  createResumeSchema,
  resumeListResponseSchema,
  resumeResponseSchema,
  updateResumeSchema,
  type CreateResume,
  type Resume,
  type ResumeSummary,
  type UpdateResume,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

export const resumesKeys = {
  list: (sub: string | null) => queryKey("resumes", { sub: sub ?? "anonim" }),
  detail: (sub: string | null, id: string) => queryKey("resume", { id, sub: sub ?? "anonim" }),
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
