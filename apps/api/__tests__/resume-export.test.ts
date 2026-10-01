// Kontributor ekspor CV (utang U-25, 2026-10-01).
//
// Dibuktikan: setiap CV milik pemanggil ikut LENGKAP beserta isinya (bentuk
// `GET /me/resumes/:id`), lewat service yang sama — bukan ringkasan tanpa isi.
import { describe, expect, it, vi } from "vitest";
import {
  dataExportSchema,
  resumeContentInputSchema,
  type Resume,
  type ResumeContent,
  type ResumeSummary,
} from "@nawasena/schemas";
import { createResumesExportContributor } from "../src/modules/resumes/index.js";

const USER = "018f4c1e-0000-7000-8000-00000000aaaa";

const ringkasan = (n: number): ResumeSummary => ({
  id: `018f4c1e-0000-7000-8000-00000000c00${String(n)}`,
  title: `CV ${String(n)}`,
  pdfUrl: null,
  createdVia: "manual",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
});

const lengkap = (r: ResumeSummary): Resume => ({
  ...r,
  content: resumeContentInputSchema.parse({ headline: `Isi ${r.title}` }) as ResumeContent,
});

describe("createResumesExportContributor", () => {
  it("bagian `resumes`: setiap CV pemanggil, lengkap dengan isinya", async () => {
    const daftar = [ringkasan(1), ringkasan(2)];
    const list = vi.fn(() => Promise.resolve(daftar));
    const get = vi.fn((_a: { userId: string }, id: string) =>
      Promise.resolve(lengkap(daftar.find((d) => d.id === id)!)),
    );
    const kontributor = createResumesExportContributor({ resumes: { list, get } as never });

    expect(kontributor.bagian).toBe("resumes");
    const hasil = (await kontributor.kumpulkan(USER)) as Resume[];

    expect(list).toHaveBeenCalledWith({ userId: USER });
    expect(get.mock.calls.every(([aktor]) => aktor.userId === USER)).toBe(true);
    expect(hasil.map((r) => r.content.headline)).toEqual(["Isi CV 1", "Isi CV 2"]);
    expect(dataExportSchema.shape.resumes.safeParse(hasil).success).toBe(true);
  });

  it("tanpa CV → larik kosong", async () => {
    const kontributor = createResumesExportContributor({
      resumes: { list: () => Promise.resolve([]), get: vi.fn() } as never,
    });
    expect(await kontributor.kumpulkan(USER)).toEqual([]);
  });
});
