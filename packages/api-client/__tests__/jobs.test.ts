// Endpoint lowongan admin (PR-055 server; PR-057 konsumen pertama).
//
// YANG DIUJI DI SINI: amplop `{ data }` benar-benar dibuka, body divalidasi
// SEBELUM berangkat, dan `publish`/`close` tidak mengirim badan apa pun —
// pola sama `companies.test.ts`.
import { describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  closeJobAdmin,
  createJobAdmin,
  jobsKeys,
  listJobsAdmin,
  publishJobAdmin,
  searchJobs,
  updateJobAdmin,
} from "../src/index.js";

const LOWONGAN = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  companyId: "01912345-89ab-7def-8123-4567890abd01",
  title: "Staf Admin",
  description: "Deskripsi lowongan",
  requirements: null,
  employmentType: "full_time",
  workMode: "onsite",
  city: "Jakarta",
  province: "DKI Jakarta",
  salaryMin: null,
  salaryMax: null,
  salaryVisible: true,
  accommodations: [],
  welcomedDisabilityTypes: [],
  source: "admin_curated",
  status: "draft",
  createdBy: null,
  publishedAt: null,
  expiresAt: null,
  createdAt: "2026-01-15T20:00:00.000Z",
  updatedAt: "2026-01-15T20:00:00.000Z",
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

describe("listJobsAdmin", () => {
  it("memanggil GET /admin/jobs dan membuka amplop `{ data }`", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [LOWONGAN] }));

    await expect(listJobsAdmin(klien(fetch))).resolves.toEqual([LOWONGAN]);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/admin/jobs");
  });

  it("jawaban yang menyimpang dari kontrak ditolak, bukan diteruskan", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ title: 42 }] }));

    await expect(listJobsAdmin(klien(fetch))).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
  });
});

describe("createJobAdmin", () => {
  it("mengirim POST berisi badan yang sudah divalidasi + default", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(201, { data: LOWONGAN }));

    await createJobAdmin(klien(fetch), {
      companyId: LOWONGAN.companyId,
      title: "Staf Admin",
      description: "Deskripsi lowongan",
      employmentType: "full_time",
      workMode: "onsite",
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      companyId: LOWONGAN.companyId,
      title: "Staf Admin",
      description: "Deskripsi lowongan",
      requirements: null,
      employmentType: "full_time",
      workMode: "onsite",
      city: null,
      province: null,
      salaryMin: null,
      salaryMax: null,
      salaryVisible: true,
      accommodations: [],
      welcomedDisabilityTypes: [],
    });
  });

  it("judul kosong ditolak di klien — tidak pernah berangkat ke server", async () => {
    const fetch = vi.fn();

    await expect(
      createJobAdmin(klien(fetch), {
        companyId: LOWONGAN.companyId,
        title: "",
        description: "x",
        employmentType: "full_time",
        workMode: "onsite",
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("companyId bukan UUID ditolak di klien", async () => {
    const fetch = vi.fn();

    await expect(
      createJobAdmin(klien(fetch), {
        companyId: "bukan-uuid",
        title: "Staf Admin",
        description: "x",
        employmentType: "full_time",
        workMode: "onsite",
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("taksonomi akomodasi liar ditolak di klien", async () => {
    const fetch = vi.fn();

    await expect(
      createJobAdmin(klien(fetch), {
        companyId: LOWONGAN.companyId,
        title: "Staf Admin",
        description: "x",
        employmentType: "full_time",
        workMode: "onsite",
        accommodations: ["kursi_pijat" as never],
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("salaryMin lebih besar dari salaryMax ditolak di klien", async () => {
    const fetch = vi.fn();

    await expect(
      createJobAdmin(klien(fetch), {
        companyId: LOWONGAN.companyId,
        title: "Staf Admin",
        description: "x",
        employmentType: "full_time",
        workMode: "onsite",
        salaryMin: 6_000_000,
        salaryMax: 5_000_000,
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("updateJobAdmin", () => {
  it("mengirim PUT ke /admin/jobs/:id dengan badan sebagian", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: LOWONGAN }));

    await updateJobAdmin(klien(fetch), LOWONGAN.id, { title: "Judul Baru" });

    expect(fetch.mock.calls[0]?.[0]).toBe(`https://x/api/v1/admin/jobs/${LOWONGAN.id}`);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ title: "Judul Baru" });
  });

  it("`status` DITOLAK di klien — hanya lewat publishJobAdmin/closeJobAdmin", async () => {
    const fetch = vi.fn();

    await expect(
      updateJobAdmin(klien(fetch), LOWONGAN.id, { status: "published" } as never),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("`companyId` DITOLAK di klien — lowongan tidak berpindah pemilik", async () => {
    const fetch = vi.fn();

    await expect(
      updateJobAdmin(klien(fetch), LOWONGAN.id, { companyId: "x" } as never),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("id disisipkan aman lewat encodeURIComponent", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: LOWONGAN }));

    await updateJobAdmin(klien(fetch), "id aneh/lain", { title: "x" });

    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/admin/jobs/id%20aneh%2Flain");
  });
});

describe("publishJobAdmin", () => {
  it("mengirim POST TANPA badan ke /admin/jobs/:id/publish", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { ...LOWONGAN, status: "published" } }));

    const hasil = await publishJobAdmin(klien(fetch), LOWONGAN.id);

    expect(fetch.mock.calls[0]?.[0]).toBe(`https://x/api/v1/admin/jobs/${LOWONGAN.id}/publish`);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(hasil.status).toBe("published");
  });
});

describe("closeJobAdmin", () => {
  it("mengirim POST TANPA badan ke /admin/jobs/:id/close", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { ...LOWONGAN, status: "closed" } }));

    const hasil = await closeJobAdmin(klien(fetch), LOWONGAN.id);

    expect(fetch.mock.calls[0]?.[0]).toBe(`https://x/api/v1/admin/jobs/${LOWONGAN.id}/close`);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(hasil.status).toBe("closed");
  });
});

describe("jobsKeys", () => {
  it("adminList() tanpa params — daftar sama untuk semua admin", () => {
    expect(jobsKeys.adminList()).toEqual(["admin-jobs"]);
  });

  it("search() melingkupi filter, TANPA cursor", () => {
    expect(jobsKeys.search({ query: "kasir", city: "Jakarta" })).toEqual([
      "jobs-search",
      { city: "Jakarta", query: "kasir" },
    ]);
  });

  it("search(): urutan accommodations tidak memengaruhi kunci", () => {
    const a = jobsKeys.search({ accommodations: ["akses_kursi_roda", "juru_bahasa_isyarat"] });
    const b = jobsKeys.search({ accommodations: ["juru_bahasa_isyarat", "akses_kursi_roda"] });
    expect(a).toEqual(b);
  });
});

const HASIL_LOWONGAN = {
  id: "01912345-89ab-7def-8123-4567890abd50",
  companyId: "01912345-89ab-7def-8123-4567890abd01",
  companyName: "PT Contoh",
  title: "Staf Layanan Pelanggan",
  employmentType: "full_time",
  workMode: "onsite",
  city: "Jakarta",
  province: "DKI Jakarta",
  accommodations: ["akses_kursi_roda"],
  publishedAt: "2026-08-10T00:00:00.000Z",
};

describe("searchJobs", () => {
  it("memanggil GET /jobs TANPA query string bila tidak ada filter", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [HASIL_LOWONGAN], meta: { nextCursor: null } }),
    );

    const hasil = await searchJobs(klien(fetch));

    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/jobs");
    expect(hasil.data).toEqual([HASIL_LOWONGAN]);
    expect(hasil.meta.nextCursor).toBeNull();
  });

  it("menyertakan query/city/province/workMode/cursor/limit sebagai parameter", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [], meta: { nextCursor: null } }));

    await searchJobs(klien(fetch), {
      query: "kasir",
      city: "Jakarta",
      province: "DKI Jakarta",
      workMode: "remote",
      cursor: "abc123",
      limit: 10,
    });

    const url = new URL(fetch.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/api/v1/jobs");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: "kasir",
      city: "Jakarta",
      province: "DKI Jakarta",
      workMode: "remote",
      cursor: "abc123",
      limit: "10",
    });
  });

  it("accommodations dikirim sebagai parameter BERULANG, bukan digabung koma", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [], meta: { nextCursor: null } }));

    await searchJobs(klien(fetch), {
      accommodations: ["akses_kursi_roda", "juru_bahasa_isyarat"],
    });

    const url = new URL(fetch.mock.calls[0]?.[0] as string);
    expect(url.searchParams.getAll("accommodations")).toEqual([
      "akses_kursi_roda",
      "juru_bahasa_isyarat",
    ]);
  });

  it("string kosong TIDAK dikirim sebagai parameter (bukan filter kosong yang berarti)", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [], meta: { nextCursor: null } }));

    await searchJobs(klien(fetch), { query: "", city: "" });

    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/jobs");
  });

  it("jawaban yang menyimpang dari kontrak ditolak, bukan diteruskan", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ title: 42 }] }));

    await expect(searchJobs(klien(fetch))).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
  });
});
