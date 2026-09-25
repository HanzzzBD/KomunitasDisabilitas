import type { PdfRenderJob, PdfRenderResult } from "@nawasena/schemas";
import { resumePdfKey, type ObjectStorage } from "../../../core/storage/index.js";
import type { ResumesService } from "../services/resumes.service.js";
import { resumeRenderHash } from "./hash.js";
import { renderResumeHtml } from "./template.js";

export interface ResumePdfRenderer {
  render(html: string): Promise<Uint8Array>;
}

export interface ResumePdfService {
  render(job: PdfRenderJob): Promise<PdfRenderResult>;
}

export interface ResumePdfServiceDeps {
  resumes: Pick<ResumesService, "get" | "setPdfReadyIfUnchanged">;
  storage: ObjectStorage;
  renderer: ResumePdfRenderer;
  /** Batas snapshot JSON sebelum ia diperbesar menjadi DOM Chromium. */
  maxInputBytes: number;
  maxPdfBytes: number;
}

export class ResumePdfInputTooLargeError extends Error {
  constructor(
    readonly actualBytes: number,
    readonly maxBytes: number,
  ) {
    super(`Snapshot CV ${String(actualBytes)} byte melewati batas ${String(maxBytes)} byte`);
    this.name = "ResumePdfInputTooLargeError";
  }
}

export function createResumePdfService(deps: ResumePdfServiceDeps): ResumePdfService {
  return {
    async render(job) {
      const actor = { userId: job.userId };
      const resume = await deps.resumes.get(actor, job.resumeId);

      // Skema memberi batas per field/larik, tetapi baris yang ditulis langsung
      // ke database dapat melewatinya. Batasi snapshot SEBELUM hashing, HTML,
      // dan DOM Chromium agar data rusak tidak sempat diperbesar di memori.
      const inputBytes = new TextEncoder().encode(
        JSON.stringify({ title: resume.title, content: resume.content }),
      ).byteLength;
      if (inputBytes > deps.maxInputBytes) {
        throw new ResumePdfInputTooLargeError(inputBytes, deps.maxInputBytes);
      }

      const actualHash = resumeRenderHash(resume);

      // CV berubah setelah enqueue. Selesaikan job lama tanpa retry: job baru
      // bagi hash terbaru adalah tanggung jawab produser PR-064.
      if (actualHash !== job.contentHash) return { status: "stale" };

      const key = resumePdfKey({
        userId: job.userId,
        resumeId: job.resumeId,
        contentHash: actualHash,
      });
      if (resume.pdfUrl === key) return { status: "already_current", key };

      const pdf = await deps.renderer.render(renderResumeHtml(resume.title, resume.content));
      await deps.storage.upload({
        key,
        body: pdf,
        contentType: "application/pdf",
        contentDisposition: "attachment",
        cacheControl: "private, no-store",
        maxBytes: deps.maxPdfBytes,
      });

      // Optimistic write: edit/hapus yang terjadi selama Chromium bekerja tidak
      // boleh ditimpa pointer PDF dari snapshot lama.
      const tersimpan = await deps.resumes.setPdfReadyIfUnchanged(
        actor,
        job.resumeId,
        resume.updatedAt,
        key,
      );
      if (!tersimpan) return { status: "stale" };
      return { status: "rendered", key, bytes: pdf.byteLength };
    },
  };
}
