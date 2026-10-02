// Endpoint lamaran admin (PR-077a server; PR-077b konsumen pertama).
//
// YANG DIUJI DI SINI: query string memakai nama SERVER (`job_id`), badan
// divalidasi SEBELUM berangkat (alasan kosong tidak pernah sampai ke server),
// dan salinan pengungkapan dibuka dari amplop `{ data }`.
import { describe, expect, it, vi } from "vitest";
import {
  applicationsKeys,
  applyJob,
  confirmHiredMyApplication,
  createApiClient,
  listMyApplications,
  withdrawMyApplication,
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
    expect(Object.keys(applicationsKeys)).toEqual([
      "adminList",
      "adminDetail",
      "myList",
      "myDetail",
    ]);
  });
});

describe("applyJob (PR-078)", () => {
  const LAMARAN_BARU = {
    id: ID,
    jobId: JOB,
    resumeId: ID,
    discloseDisability: false,
    status: "submitted",
    appliedAt: "2026-10-02T03:00:00.000Z",
  };

  it("POST ke lowongan dengan Idempotency-Key dari pemanggil + pilihan pengungkapan eksplisit", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(201, { data: LAMARAN_BARU }));
    const hasil = await applyJob(
      klien(fetch),
      JOB,
      { resumeId: ID, discloseDisability: false },
      "kunci-uji-12345678",
    );

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://x/api/v1/jobs/${JOB}/apply`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("kunci-uji-12345678");
    expect(JSON.parse(String(init.body))).toEqual({ resumeId: ID, discloseDisability: false });
    expect(hasil.id).toBe(ID);
  });

  it("header tambahan tidak bisa menimpa authorization/accept", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(201, { data: LAMARAN_BARU }));
    const c = createApiClient({
      baseUrl: "https://x/api/v1",
      fetch: fetch as unknown as typeof globalThis.fetch,
      getAccessToken: () => "token-asli",
    });
    await c.request("/x", { headers: { authorization: "palsu", accept: "text/html" } });
    const headers = (fetch.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer token-asli");
    expect(headers.accept).toBe("application/json");
  });

  it("pilihan pengungkapan yang tidak dinyatakan ditolak SEBELUM berangkat", async () => {
    const fetch = vi.fn();
    await expect(
      applyJob(klien(fetch), JOB, { resumeId: ID } as never, "kunci-uji-12345678"),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Lamaran Saya (PR-079)", () => {
  const SAYA = {
    id: ID,
    jobId: JOB,
    resumeId: null,
    discloseDisability: false,
    status: "offered",
    appliedAt: "2026-10-02T03:00:00.000Z",
    updatedAt: "2026-10-02T03:00:00.000Z",
    hiredConfirmedAt: null,
    job: { title: "Staf Admin", companyName: "PT Uji", aktif: true },
  };

  it("daftar mengirim `job_id` dengan nama server", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [SAYA], meta: { nextCursor: null } }));
    const hasil = await listMyApplications(klien(fetch), { jobId: JOB });
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v1/me/applications");
    expect(url.searchParams.get("job_id")).toBe(JOB);
    expect(hasil.data[0]?.status).toBe("offered");
  });

  it("withdraw & confirm-hired = POST tanpa badan ke jalur masing-masing", async () => {
    // Response baru per panggilan: badan Response hanya bisa dibaca sekali.
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { data: { ...SAYA, statusHistory: [] } })),
      );
    await withdrawMyApplication(klien(fetch), ID);
    await confirmHiredMyApplication(klien(fetch), ID);
    const [[u1, i1], [u2, i2]] = fetch.mock.calls as [[string, RequestInit], [string, RequestInit]];
    expect(u1).toBe(`https://x/api/v1/me/applications/${ID}/withdraw`);
    expect(u2).toBe(`https://x/api/v1/me/applications/${ID}/confirm-hired`);
    expect([i1.method, i2.method, i1.body, i2.body]).toEqual([
      "POST",
      "POST",
      undefined,
      undefined,
    ]);
  });
});
