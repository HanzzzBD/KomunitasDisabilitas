// Endpoint lamaran admin (PR-077a server; PR-077b konsumen pertama).
//
// YANG DIUJI DI SINI: query string memakai nama SERVER (`job_id`), badan
// divalidasi SEBELUM berangkat (alasan kosong tidak pernah sampai ke server),
// dan salinan pengungkapan dibuka dari amplop `{ data }`.
import { describe, expect, it, vi } from "vitest";
import {
  applicationsKeys,
  createApiClient,
  getApplicationAdmin,
  listApplicationsAdmin,
  revealDisclosureAdmin,
  updateApplicationStatusAdmin,
} from "../src/index.js";

const ID = "01912345-89ab-7def-8123-456789abcdef";
const JOB = "01912345-89ab-7def-8123-4567890abd01";

const LAMARAN = {
  id: ID,
  jobId: JOB,
  resumeId: null,
  discloseDisability: false,
  status: "submitted",
  appliedAt: "2026-10-02T03:00:00.000Z",
  updatedAt: "2026-10-02T03:00:00.000Z",
  hiredConfirmedAt: null,
  job: { title: "Staf Admin", companyName: "PT Uji", aktif: true },
  applicant: { userId: JOB, fullName: "Pelamar Uji" },
};

const DETAIL = {
  ...LAMARAN,
  statusHistory: [],
  applicant: { userId: JOB, fullName: "Pelamar Uji", phone: null, email: null },
  resume: null,
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

describe("listApplicationsAdmin", () => {
  it("mengirim filter dengan nama server (`job_id`) dan cursor, mengembalikan amplop utuh", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [LAMARAN], meta: { nextCursor: "abc" } }));
    const hasil = await listApplicationsAdmin(klien(fetch), {
      jobId: JOB,
      status: "submitted",
      cursor: "xyz",
    });

    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v1/admin/applications");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      job_id: JOB,
      status: "submitted",
      cursor: "xyz",
    });
    expect(hasil.meta.nextCursor).toBe("abc");
    expect(hasil.data[0]?.applicant.fullName).toBe("Pelamar Uji");
  });

  it("tanpa filter → tanpa query string", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [], meta: { nextCursor: null } }));
    await listApplicationsAdmin(klien(fetch));
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://x/api/v1/admin/applications");
  });
});

describe("getApplicationAdmin / updateApplicationStatusAdmin", () => {
  it("detail dibuka dari amplop", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: DETAIL }));
    expect((await getApplicationAdmin(klien(fetch), ID)).id).toBe(ID);
  });

  it("PUT status mengirim status + alasan", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { ...DETAIL, status: "interview" } }));
    await updateApplicationStatusAdmin(klien(fetch), ID, {
      status: "interview",
      reason: "perusahaan mengundang",
    });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      status: "interview",
      reason: "perusahaan mengundang",
    });
  });

  it("alasan kosong ditolak SEBELUM berangkat", async () => {
    const fetch = vi.fn();
    await expect(
      updateApplicationStatusAdmin(klien(fetch), ID, { status: "viewed", reason: "  " }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("revealDisclosureAdmin", () => {
  it("POST alasan → salinan dari amplop; tanpa query key (tidak di-cache)", async () => {
    const salinan = {
      disabilityTypes: ["tuli"],
      accommodationNeeds: { tags: ["juru_bahasa_isyarat"], notes: null },
      capturedAt: "2026-10-02T03:00:00.000Z",
    };
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: salinan }));
    expect(await revealDisclosureAdmin(klien(fetch), ID, "tiket #1")).toEqual(salinan);
    expect(Object.keys(applicationsKeys)).toEqual(["adminList", "adminDetail"]);
  });
});
