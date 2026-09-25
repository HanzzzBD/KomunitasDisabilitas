import { describe, expect, it, vi } from "vitest";
import { resumeContentInputSchema, type PdfRenderJob, type Resume } from "@nawasena/schemas";
import type { ObjectStorage } from "../src/core/storage/index.js";
import {
  createResumePdfService,
  escapeResumeHtml,
  renderResumeHtml,
  resumeRenderHash,
  ResumePdfInputTooLargeError,
  type ResumePdfRenderer,
} from "../src/modules/resumes/index.js";

const USER_ID = "018f4c1e-0000-7000-8000-00000000aaaa";
const RESUME_ID = "018f4c1e-0000-7000-8000-00000000001a";

const content = resumeContentInputSchema.parse({
  headline: "Pengembang perangkat lunak inklusif 🌏 漢字",
  summary: "Membangun produk aksesibel untuk semua orang.",
  contact: {
    email: "rina@example.test",
    phone: "+62 811-0000-0000",
    city: "Yogyakarta",
    province: "DI Yogyakarta",
    links: [{ label: "Portofolio", url: "https://example.test/rina?a=1&b=2" }],
  },
  experiences: [
    {
      title: "Frontend Engineer",
      company: "Studio Inklusif",
      startDate: "2023-01-01",
      description: "Meningkatkan aksesibilitas aplikasi.",
    },
  ],
  educations: [{ institution: "Universitas Contoh", degree: "S.Kom.", year: 2022 }],
  skills: [{ name: "TypeScript", level: "Mahir" }],
  certifications: [{ name: "Web Accessibility", issuer: "IAAP", year: 2024 }],
  organizations: [{ name: "Komunitas A11y", role: "Relawan" }],
});

function resume(patch: Partial<Resume> = {}): Resume {
  return {
    id: RESUME_ID,
    title: "CV Rina",
    content,
    pdfUrl: null,
    createdVia: "manual",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...patch,
  };
}

/**
 * Job renderer untuk satu snapshot CV. Derivasi jobId deterministik + payload
 * tanpa isi CV adalah kontrak PRODUSER (PR-064, `buildResumePdfTask`); di sini
 * hanya dibutuhkan job yang VALID untuk memanggil `service.render()`.
 */
function jobFor(resume: Resume): PdfRenderJob {
  return { userId: USER_ID, resumeId: resume.id, contentHash: resumeRenderHash(resume) };
}

describe("template PDF CV", () => {
  it("mempertahankan struktur heading dan urutan baca dalam snapshot", () => {
    const html = renderResumeHtml("CV Rina", content);
    const headings = [...html.matchAll(/<(h[1-3])(?:\s[^>]*)?>(.*?)<\/\1>/g)].map(
      ([, level, text]) => `${level ?? "?"}: ${text ?? ""}`,
    );

    expect(headings).toMatchInlineSnapshot(`
      [
        "h1: CV Rina",
        "h2: Ringkasan",
        "h2: Pengalaman kerja",
        "h3: Frontend Engineer",
        "h2: Pendidikan",
        "h3: Universitas Contoh",
        "h2: Keahlian",
        "h2: Sertifikasi dan pelatihan",
        "h3: Web Accessibility",
        "h2: Organisasi dan kerelawanan",
        "h3: Komunitas A11y",
      ]
    `);
    expect(html).toContain('<html lang="id">');
    expect(html).toContain("@page { size: A4;");
    expect(html.indexOf("Ringkasan")).toBeLessThan(html.indexOf("Pengalaman kerja"));
    expect(html.indexOf("Pengalaman kerja")).toBeLessThan(html.indexOf("Pendidikan"));
  });

  it("meng-escape semua konten dan atribut milik pengguna", () => {
    const berbahaya = resumeContentInputSchema.parse({
      summary: '<img src=x onerror="alert(1)">',
      contact: {
        links: [{ label: '<script>alert("x")</script>', url: "https://example.test/?a=1&b=2" }],
      },
      experiences: [{ title: "<b>Lead</b>" }],
    });
    const html = renderResumeHtml("CV <script>alert(1)</script>", berbahaya);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Lead</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("https://example.test/?a=1&amp;b=2");
    expect(escapeResumeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("menyertakan karakter non-latin dan emoji sebagai UTF-8, bukan menghapusnya", () => {
    const html = renderResumeHtml("CV Unicode", content);
    expect(html).toContain("🌏 漢字");
    expect(html).toContain('<meta charset="utf-8">');
  });
});

describe("identitas render PDF", () => {
  it("hash stabil terhadap urutan key object tetapi berubah saat isi berubah", () => {
    const asli = resume();
    const urutanKeyLain = {
      title: asli.title,
      content: Object.fromEntries(Object.entries(asli.content).reverse()),
    } as Pick<Resume, "title" | "content">;
    expect(resumeRenderHash(urutanKeyLain)).toBe(resumeRenderHash(asli));
    expect(resumeRenderHash({ ...asli, title: "CV Rina revisi" })).not.toBe(resumeRenderHash(asli));
  });
});

function storagePalsu(): ObjectStorage & { uploads: unknown[] } {
  const uploads: unknown[] = [];
  return {
    uploads,
    upload: (input) => {
      uploads.push(input);
      return Promise.resolve({ key: input.key, size: input.body.byteLength });
    },
    presignDownload: () =>
      Promise.resolve({ url: "https://storage.test/signed", expiresAt: new Date() }),
  };
}

describe("service render PDF", () => {
  it("konten yang sama hanya dirender dan diunggah sekali", async () => {
    const row = resume();
    const renderer: ResumePdfRenderer = {
      render: vi.fn(() => Promise.resolve(new TextEncoder().encode("%PDF-1.7 hasil"))),
    };
    const storage = storagePalsu();
    const setPdfReadyIfUnchanged = vi.fn(
      (_actor: { userId: string }, _id: string, _updatedAt: string, key: string) => {
        row.pdfUrl = key;
        return Promise.resolve(true);
      },
    );
    const service = createResumePdfService({
      resumes: { get: () => Promise.resolve(row), setPdfReadyIfUnchanged },
      storage,
      renderer,
      maxInputBytes: 1_048_576,
      maxPdfBytes: 20_971_520,
    });
    const job = jobFor(row);

    await expect(service.render(job)).resolves.toMatchObject({ status: "rendered" });
    await expect(service.render(job)).resolves.toEqual({
      status: "already_current",
      key: row.pdfUrl,
    });
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0]).toMatchObject({
      key: row.pdfUrl,
      contentType: "application/pdf",
      contentDisposition: "attachment",
      cacheControl: "private, no-store",
    });
  });

  it("menyelesaikan job stale tanpa menyalakan renderer", async () => {
    const row = resume();
    const renderer: ResumePdfRenderer = { render: vi.fn() };
    const service = createResumePdfService({
      resumes: {
        get: () => Promise.resolve(row),
        setPdfReadyIfUnchanged: () => Promise.resolve(true),
      },
      storage: storagePalsu(),
      renderer,
      maxInputBytes: 1_048_576,
      maxPdfBytes: 20_971_520,
    });
    const job = { ...jobFor(row), contentHash: "a".repeat(64) };

    await expect(service.render(job)).resolves.toEqual({ status: "stale" });
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("tidak memasang pointer PDF bila CV berubah selama Chromium bekerja", async () => {
    const row = resume();
    const service = createResumePdfService({
      resumes: {
        get: () => Promise.resolve(row),
        setPdfReadyIfUnchanged: () => Promise.resolve(false),
      },
      storage: storagePalsu(),
      renderer: { render: () => Promise.resolve(new TextEncoder().encode("%PDF-1.7")) },
      maxInputBytes: 1_048_576,
      maxPdfBytes: 20_971_520,
    });

    await expect(service.render(jobFor(row))).resolves.toEqual({
      status: "stale",
    });
  });

  it("menolak snapshot terlalu besar sebelum membentuk DOM Chromium", async () => {
    const row = resume();
    const renderer: ResumePdfRenderer = { render: vi.fn() };
    const service = createResumePdfService({
      resumes: {
        get: () => Promise.resolve(row),
        setPdfReadyIfUnchanged: () => Promise.resolve(true),
      },
      storage: storagePalsu(),
      renderer,
      maxInputBytes: 1,
      maxPdfBytes: 20_971_520,
    });

    await expect(service.render(jobFor(row))).rejects.toBeInstanceOf(
      ResumePdfInputTooLargeError,
    );
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("meneruskan crash renderer agar runtime BullMQ dapat retry", async () => {
    const row = resume();
    const service = createResumePdfService({
      resumes: {
        get: () => Promise.resolve(row),
        setPdfReadyIfUnchanged: () => Promise.resolve(true),
      },
      storage: storagePalsu(),
      renderer: { render: () => Promise.reject(new Error("Chromium crash")) },
      maxInputBytes: 1_048_576,
      maxPdfBytes: 20_971_520,
    });

    await expect(service.render(jobFor(row))).rejects.toThrow("Chromium crash");
  });
});
