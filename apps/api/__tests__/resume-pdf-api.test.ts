import { describe, expect, it, vi } from "vitest";
import { resumeContentInputSchema, type Resume } from "@nawasena/schemas";
import type { QueueJobLike, QueueLike, QueueRegistry } from "../src/core/queue/index.js";
import {
  buildResumePdfTask,
  createResumePdfApiService,
  createResumePdfJobs,
  mapResumePdfJobState,
} from "../src/modules/resumes/index.js";

const USER_ID = "018f4c1e-0000-7000-8000-00000000aaaa";
const RESUME_ID = "018f4c1e-0000-7000-8000-00000000001a";

function resume(patch: Partial<Resume> = {}): Resume {
  return {
    id: RESUME_ID,
    title: "CV utama",
    content: resumeContentInputSchema.parse({ summary: "Ringkasan" }),
    pdfUrl: null,
    createdVia: "manual",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...patch,
  };
}

describe("status API PDF", () => {
  it.each([
    ["missing", "idle"],
    ["queued", "queued"],
    ["processing", "processing"],
    ["completed", "failed"],
    ["failed", "failed"],
  ] as const)("memetakan %s menjadi %s", (input, output) => {
    expect(mapResumePdfJobState(input)).toEqual({ status: output });
  });

  it("mengembalikan URL baru hanya bila pointer cocok dengan hash isi saat ini", async () => {
    const row = resume();
    const task = buildResumePdfTask(USER_ID, row);
    const key = `resumes/${USER_ID}/${RESUME_ID}/${task.job.contentHash}.pdf`;
    row.pdfUrl = key;
    const presignDownload = vi.fn(() =>
      Promise.resolve({
        url: "https://storage.test/signed-baru",
        expiresAt: new Date("2026-09-25T12:05:00.000Z"),
      }),
    );
    const service = createResumePdfApiService({
      resumes: { get: () => Promise.resolve(row) },
      jobs: { state: vi.fn(), ensure: vi.fn() },
      storage: { presignDownload },
    });

    await expect(service.status({ userId: USER_ID }, RESUME_ID)).resolves.toEqual({
      status: "ready",
      downloadUrl: "https://storage.test/signed-baru",
      expiresAt: "2026-09-25T12:05:00.000Z",
    });
    expect(presignDownload).toHaveBeenCalledWith({ key });
  });

  it("request meneruskan job referensi+hash dengan jobId deterministik", async () => {
    const row = resume();
    const ensure = vi.fn(() => Promise.resolve("queued" as const));
    const service = createResumePdfApiService({
      resumes: { get: () => Promise.resolve(row) },
      jobs: { state: vi.fn(), ensure },
      storage: { presignDownload: vi.fn() },
    });
    const expected = buildResumePdfTask(USER_ID, row);

    await expect(service.request({ userId: USER_ID }, RESUME_ID)).resolves.toEqual({
      status: "queued",
    });
    expect(ensure).toHaveBeenCalledWith(expected.jobId, expected.job);
  });
});

describe("adapter job PDF", () => {
  it("klik ganda pada job antre tidak memanggil enqueue kedua", async () => {
    const getState = vi.fn(() => Promise.resolve("waiting"));
    const job = { getState, remove: vi.fn() } satisfies QueueJobLike;
    const queue = { getJob: vi.fn(() => Promise.resolve(job)) } as unknown as QueueLike;
    const enqueue = vi.fn();
    const jobs = createResumePdfJobs({
      queueOf: () => queue,
      enqueue,
    } as unknown as Pick<QueueRegistry, "queueOf" | "enqueue">);

    const payload = buildResumePdfTask(USER_ID, resume());
    await expect(jobs.ensure(payload.jobId, payload.job)).resolves.toBe("queued");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("retry manual membuang job gagal agar attempts kembali dari nol", async () => {
    const remove = vi.fn(() => Promise.resolve());
    const job = {
      getState: () => Promise.resolve("failed"),
      remove,
    } satisfies QueueJobLike;
    const queue = { getJob: () => Promise.resolve(job) } as unknown as QueueLike;
    const enqueue = vi.fn(() => Promise.resolve({ jobId: "baru" }));
    const jobs = createResumePdfJobs({
      queueOf: () => queue,
      enqueue,
    } as unknown as Pick<QueueRegistry, "queueOf" | "enqueue">);
    const payload = buildResumePdfTask(USER_ID, resume());

    await jobs.ensure(payload.jobId, payload.job);
    expect(remove).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
