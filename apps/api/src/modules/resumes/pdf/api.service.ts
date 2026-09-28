import type { ResumePdfStatus } from "@nawasena/schemas";
import type { ObjectStorage } from "../../../core/storage/index.js";
import type { ResumesActor, ResumesService } from "../services/resumes.service.js";
import { buildResumePdfTask, resumeRenderHash } from "./hash.js";
import type { ResumePdfJobs, ResumePdfJobState } from "./jobs.js";
import { resumePdfKey } from "../../../core/storage/index.js";

export interface ResumePdfApiService {
  request(actor: ResumesActor, resumeId: string): Promise<ResumePdfStatus>;
  status(actor: ResumesActor, resumeId: string): Promise<ResumePdfStatus>;
}

export interface ResumePdfApiDeps {
  resumes: Pick<ResumesService, "get">;
  jobs: ResumePdfJobs;
  storage: Pick<ObjectStorage, "presignDownload">;
}

export function mapResumePdfJobState(state: ResumePdfJobState): ResumePdfStatus {
  switch (state) {
    case "queued":
      return { status: "queued" };
    case "processing":
      return { status: "processing" };
    case "failed":
    case "completed":
      // `completed` tanpa pointer adalah penyelesaian stale/tidak konsisten.
      // Tampilkan jalan retry, bukan spinner yang tidak pernah selesai.
      return { status: "failed" };
    case "missing":
      return { status: "idle" };
  }
}

export function createResumePdfApiService(deps: ResumePdfApiDeps): ResumePdfApiService {
  async function snapshot(actor: ResumesActor, resumeId: string) {
    const resume = await deps.resumes.get(actor, resumeId);
    const contentHash = resumeRenderHash(resume);
    const key = resumePdfKey({ userId: actor.userId, resumeId, contentHash });
    return { resume, contentHash, key };
  }

  async function ready(key: string): Promise<ResumePdfStatus> {
    const signed = await deps.storage.presignDownload({ key });
    return {
      status: "ready",
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
    };
  }

  return {
    async status(actor, resumeId) {
      const current = await snapshot(actor, resumeId);
      if (current.resume.pdfUrl === current.key) return ready(current.key);
      const task = buildResumePdfTask(actor.userId, current.resume);
      return mapResumePdfJobState(await deps.jobs.state(task.jobId));
    },

    async request(actor, resumeId) {
      const current = await snapshot(actor, resumeId);
      if (current.resume.pdfUrl === current.key) return ready(current.key);

      const task = buildResumePdfTask(actor.userId, current.resume);
      const state = await deps.jobs.ensure(task.jobId, task.job);
      return { status: state };
    },
  };
}
