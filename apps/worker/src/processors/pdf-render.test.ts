import { existsSync } from "node:fs";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  pdfRenderResultSchema,
  resumeContentInputSchema,
  type PdfRenderJob,
  type Resume,
} from "@nawasena/schemas";
import { createObjectStorage, type StorageConfig } from "@nawasena/api/core/storage";
import { createResumePdfService, resumeRenderHash } from "@nawasena/api/modules/resumes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPuppeteerPdfRenderer } from "../pdf/puppeteer-renderer.js";
import { createPdfRenderProcessor } from "./pdf-render.js";

const endpoint = process.env.STORAGE_INTEGRATION_ENDPOINT;
const chrome = process.env.PDF_INTEGRATION_CHROME;
const integration =
  endpoint !== undefined && chrome !== undefined && existsSync(chrome) ? describe : describe.skip;

const accessKeyId = "nawasena-minio";
const secretAccessKey = "nawasena-minio-secret";
const bucket = `nawasena-pdf-${String(process.pid)}-${String(Date.now())}`;
const USER_ID = "018f4c1e-0000-7000-8000-00000000aaaa";
const RESUME_ID = "018f4c1e-0000-7000-8000-00000000001a";

describe("processor PDF", () => {
  it("menolak payload yang menyelundupkan isi CV sebelum memanggil service", async () => {
    const pdf = { render: vi.fn() };
    const processor = createPdfRenderProcessor({ pdf, logger: { info: vi.fn() } });

    await expect(
      processor(
        {
          userId: USER_ID,
          resumeId: RESUME_ID,
          contentHash: "a".repeat(64),
          content: { summary: "PII tidak boleh masuk Redis" },
        },
        { queue: "pdf-render", jobId: "invalid", attemptsMade: 0 },
      ),
    ).rejects.toThrow();
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it("meneruskan error service agar runtime queue dapat retry", async () => {
    const pdf = { render: vi.fn(() => Promise.reject(new Error("Chromium crash"))) };
    const processor = createPdfRenderProcessor({ pdf, logger: { info: vi.fn() } });

    await expect(
      processor(
        { userId: USER_ID, resumeId: RESUME_ID, contentHash: "a".repeat(64) },
        { queue: "pdf-render", jobId: "retry", attemptsMade: 0 },
      ),
    ).rejects.toThrow("Chromium crash");
  });

  it("menerbitkan notifikasi siap secara idempoten untuk versi PDF yang selesai", async () => {
    const pdf = {
      render: vi.fn(() =>
        Promise.resolve({ status: "rendered" as const, key: "resumes/x.pdf", bytes: 10 }),
      ),
    };
    const terbitkan = vi.fn(() => Promise.resolve(true));
    const processor = createPdfRenderProcessor({
      pdf,
      notifications: { terbitkan },
      logger: { info: vi.fn() },
    });
    const payload = { userId: USER_ID, resumeId: RESUME_ID, contentHash: "a".repeat(64) };

    await processor(payload, { queue: "pdf-render", jobId: "notif", attemptsMade: 0 });

    expect(terbitkan).toHaveBeenCalledWith({
      userId: USER_ID,
      type: "resume.pdf_siap",
      params: { resumeId: RESUME_ID },
      kunciPeristiwa: `${RESUME_ID}:${"a".repeat(64)}`,
    });
  });
});

integration("processor PDF + Chromium + MinIO", () => {
  const config: StorageConfig = {
    endpoint: endpoint!,
    region: "us-east-1",
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: true,
    maxUploadBytes: 20_971_520,
    presignTtlSeconds: 30,
  };
  const client = new S3Client({
    endpoint,
    region: config.region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  let objectKey: string | undefined;

  beforeAll(async () => {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  });

  afterAll(async () => {
    if (objectKey !== undefined) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    }
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    client.destroy();
  });

  it("merender satu kali, menyimpan privat, dan selesai kurang dari 90 detik", async () => {
    const row: Resume = {
      id: RESUME_ID,
      title: "CV Rina — インクルーシブ 🤟",
      content: resumeContentInputSchema.parse({
        headline: "Pengembang aksesibilitas 🌏 漢字",
        summary: "Membuat teknologi yang dapat dipakai semua orang.",
        contact: {
          email: "rina@example.test",
          city: "Yogyakarta",
          links: [{ label: "Portofolio", url: "https://example.test/rina" }],
        },
        experiences: [
          {
            title: "Frontend Engineer",
            company: "Studio Inklusif",
            startDate: "2023-01-01",
            description: "Audit WCAG, pengujian keyboard, dan dukungan screen reader.",
          },
        ],
        educations: [{ institution: "Universitas Contoh", degree: "S.Kom.", year: 2022 }],
        skills: [
          { name: "TypeScript", level: "Mahir" },
          { name: "Aksesibilitas web", level: "Mahir" },
        ],
      }),
      pdfUrl: null,
      createdVia: "manual",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    };
    const storage = createObjectStorage(config);
    const chromium = createPuppeteerPdfRenderer({ executablePath: chrome! });
    let renderCount = 0;
    const pdf = createResumePdfService({
      resumes: {
        get: () => Promise.resolve(row),
        setPdfReadyIfUnchanged: (_actor, _id, expectedUpdatedAt, key) => {
          if (expectedUpdatedAt !== row.updatedAt) return Promise.resolve(false);
          row.pdfUrl = key;
          objectKey = key;
          return Promise.resolve(true);
        },
      },
      storage,
      renderer: {
        render: (html) => {
          renderCount += 1;
          return chromium.render(html);
        },
      },
      maxInputBytes: 1_048_576,
      maxPdfBytes: 20_971_520,
    });
    const logger = { info: vi.fn() };
    const processor = createPdfRenderProcessor({ pdf, logger });
    const job: PdfRenderJob = {
      userId: USER_ID,
      resumeId: row.id,
      contentHash: resumeRenderHash(row),
    };
    const context = { queue: "pdf-render" as const, jobId: "integration", attemptsMade: 0 };
    const startedAt = Date.now();

    const first = pdfRenderResultSchema.parse(await processor(job, context));
    const second = pdfRenderResultSchema.parse(await processor(job, context));

    expect(first).toMatchObject({ status: "rendered" });
    expect(second).toMatchObject({ status: "already_current" });
    expect(Date.now() - startedAt).toBeLessThan(90_000);
    expect(renderCount).toBe(1);
    expect(logger.info).toHaveBeenCalledTimes(2);

    const signed = await storage.presignDownload({ key: objectKey! });
    const response = await fetch(signed.url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(5_000);

    const unsigned = await fetch(`${endpoint}/${bucket}/${objectKey!}`);
    expect(unsigned.status).toBe(403);
  }, 90_000);
});
