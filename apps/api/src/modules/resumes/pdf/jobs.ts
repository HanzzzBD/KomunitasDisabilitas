import { QUEUE_NAME, type PdfRenderJob } from "@nawasena/schemas";
import type { QueueRegistry } from "../../../core/queue/index.js";

export type ResumePdfJobState = "missing" | "queued" | "processing" | "completed" | "failed";

/** Port antrean yang dibutuhkan fitur PDF; tidak mengekspos BullMQ ke service. */
export interface ResumePdfJobs {
  state(jobId: string): Promise<ResumePdfJobState>;
  /** Pastikan satu job berjalan; aman dipanggil berulang dengan jobId sama. */
  ensure(jobId: string, payload: PdfRenderJob): Promise<"queued" | "processing">;
}

type QueuePort = Pick<QueueRegistry, "enqueue" | "queueOf">;

function mapState(state: string): ResumePdfJobState {
  switch (state) {
    case "active":
      return "processing";
    case "waiting":
    case "waiting-children":
    case "delayed":
    case "prioritized":
      return "queued";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "missing";
  }
}

export function createResumePdfJobs(queues: QueuePort): ResumePdfJobs {
  const queue = () => queues.queueOf(QUEUE_NAME.PDF_RENDER);

  return {
    async state(jobId) {
      const job = await queue().getJob(jobId);
      return job === undefined ? "missing" : mapState(await job.getState());
    },

    async ensure(jobId, payload) {
      const existing = await queue().getJob(jobId);
      if (existing !== undefined) {
        const state = mapState(await existing.getState());
        if (state === "processing") return "processing";
        if (state === "queued") return "queued";

        // Job gagal/completed tanpa pointer PDF harus dimulai dari attempts=0.
        // `retry()` mempertahankan attemptsMade; remove + enqueue memberi retry
        // manual yang benar-benar baru. JobId tetap deterministik.
        await existing.remove().catch(() => undefined);
      }

      await queues.enqueue(QUEUE_NAME.PDF_RENDER, payload, { jobId });
      return "queued";
    },
  };
}
