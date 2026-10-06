import { describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  createResume,
  deleteResume,
  getResume,
  listResumes,
  getResumePdfStatus,
  requestResumePdf,
  downloadResumePdf,
  resumesKeys,
  updateResume,
} from "../src/index.js";

const ID = "01912345-89ab-7def-8123-456789abcdef";
const CONTENT = {
  schemaVersion: 1 as const,
  headline: null,
  summary: null,
  contact: { email: null, phone: null, city: null, province: null, links: [] },
  experiences: [],
  educations: [],
  skills: [],
  certifications: [],
  organizations: [],
};
const RESUME = {
  id: ID,
  title: "CV Saya",
  content: CONTENT,
  pdfUrl: null,
  createdVia: "manual",
  createdAt: "2026-09-25T00:00:00.000Z",
  updatedAt: "2026-09-25T00:00:00.000Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function klien(fetch: ReturnType<typeof vi.fn>) {
  return createApiClient({
    baseUrl: "https://x/api/v1",
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
}

describe("endpoint resumes", () => {
  it("unduhan privat memakai token terbaru setelah refresh 401", async () => {
    let token = "lama";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "SESI_BERAKHIR", message: "Sesi berakhir" }))
      .mockResolvedValueOnce(
        new Response("%PDF-1.7 uji", { headers: { "content-type": "application/pdf" } }),
      );
    const client = createApiClient({
      baseUrl: "https://x/api/v1",
      fetch,
      getAccessToken: () => token,
      refresh: () => {
        token = "baru";
        return true;
      },
    });
    expect(new TextDecoder().decode(await downloadResumePdf(client, ID))).toBe("%PDF-1.7 uji");
    expect(fetch.mock.calls[1]?.[0]).toBe(`https://x/api/v1/me/resumes/${ID}/pdf/download`);
    expect(fetch.mock.calls[1]?.[1].headers.authorization).toBe("Bearer baru");
  });
  it("menolak respons HTML dan berkas bukan PDF", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<html>error</html>", { headers: { "content-type": "text/html" } }),
      )
      .mockResolvedValueOnce(
        new Response("error", { headers: { "content-type": "application/pdf" } }),
      );
    await expect(downloadResumePdf(klien(fetch), ID)).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
    await expect(downloadResumePdf(klien(fetch), ID)).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
  });
  it("membuka amplop daftar dan detail", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ ...RESUME, content: undefined }] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: RESUME }));
    const client = klien(fetch);

    const daftar = await listResumes(client);
    const detail = await getResume(client, ID);

    expect(daftar[0]?.title).toBe("CV Saya");
    expect(detail.content).toEqual(CONTENT);
  });

  it("memvalidasi create dan update sebelum mengirim", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { data: RESUME }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ...RESUME, title: "CV Baru" } }));
    const client = klien(fetch);

    await createResume(client, { title: "CV Saya", content: CONTENT });
    await updateResume(client, ID, { title: "CV Baru" });

    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
    expect((fetch.mock.calls[1]?.[1] as RequestInit).method).toBe("PUT");
  });

  it("delete menerima jawaban 204 tanpa badan", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteResume(klien(fetch), ID)).resolves.toBeUndefined();
  });

  it("cache detail dilindungi pemilik dan id", () => {
    expect(resumesKeys.detail("a", ID)).not.toEqual(resumesKeys.detail("b", ID));
    expect(resumesKeys.detail("a", ID)).not.toEqual(resumesKeys.detail("a", "lain"));
    expect(resumesKeys.pdf("a", ID)).not.toEqual(resumesKeys.pdf("b", ID));
  });

  it("meminta render dan membaca URL unduh lewat kontrak status yang sama", async () => {
    const siap = {
      data: {
        status: "ready",
        downloadUrl: "https://storage.test/signed",
        expiresAt: "2026-09-25T12:05:00.000Z",
      },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(202, { data: { status: "queued" } }))
      .mockResolvedValueOnce(jsonResponse(200, siap));
    const client = klien(fetch);

    await expect(requestResumePdf(client, ID)).resolves.toEqual({ status: "queued" });
    await expect(getResumePdfStatus(client, ID)).resolves.toEqual(siap.data);
    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
    expect(fetch.mock.calls[1]?.[0]).toContain(`/me/resumes/${ID}/pdf`);
  });
});
