// Endpoint perusahaan admin (PR-051 server; PR-053 konsumen pertama).
//
// YANG DIUJI DI SINI: amplop `{ data }` benar-benar dibuka, body divalidasi
// SEBELUM berangkat (khususnya `inclusivityStatus` yang menolak "verified" di
// klien, bukan hanya di server), dan `verify` tidak mengirim badan apa pun.
import { describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  companiesKeys,
  createCompanyAdmin,
  getCompanyActiveJobs,
  getCompanyPublic,
  listCompaniesAdmin,
  updateCompanyAdmin,
  verifyCompanyAdmin,
} from "../src/index.js";

const PERUSAHAAN = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  name: "PT Contoh",
  description: null,
  website: null,
  city: "Jakarta",
  inclusivityStatus: "unverified",
  accommodationsAvailable: [],
  verifiedBy: null,
  verifiedAt: null,
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

describe("listCompaniesAdmin", () => {
  it("memanggil GET /admin/companies dan membuka amplop `{ data }`", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [PERUSAHAAN] }));

    await expect(listCompaniesAdmin(klien(fetch))).resolves.toEqual([PERUSAHAAN]);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/admin/companies");
  });

  it("jawaban yang menyimpang dari kontrak ditolak, bukan diteruskan", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ name: 42 }] }));

    await expect(listCompaniesAdmin(klien(fetch))).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
  });
});

describe("createCompanyAdmin", () => {
  it("mengirim POST berisi badan yang sudah divalidasi + default", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(201, { data: PERUSAHAAN }));

    await createCompanyAdmin(klien(fetch), { name: "PT Contoh" });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "PT Contoh",
      description: null,
      website: null,
      city: null,
      accommodationsAvailable: [],
    });
  });

  it("nama kosong ditolak di klien — tidak pernah berangkat ke server", async () => {
    const fetch = vi.fn();

    await expect(createCompanyAdmin(klien(fetch), { name: "" })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("taksonomi akomodasi liar ditolak di klien", async () => {
    const fetch = vi.fn();

    await expect(
      createCompanyAdmin(klien(fetch), {
        name: "PT Contoh",
        accommodationsAvailable: ["kursi_pijat" as never],
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("updateCompanyAdmin", () => {
  it("mengirim PUT ke /admin/companies/:id dengan badan sebagian", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PERUSAHAAN }));

    await updateCompanyAdmin(klien(fetch), PERUSAHAAN.id, { name: "Nama Baru" });

    expect(fetch.mock.calls[0]?.[0]).toBe(`https://x/api/v1/admin/companies/${PERUSAHAAN.id}`);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ name: "Nama Baru" });
  });

  it("inclusivityStatus 'verified' DITOLAK di klien — hanya lewat verifyCompanyAdmin", async () => {
    const fetch = vi.fn();

    await expect(
      updateCompanyAdmin(klien(fetch), PERUSAHAAN.id, {
        inclusivityStatus: "verified" as never,
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("inclusivityStatus 'unverified'/'self_claimed' diterima (koreksi turun)", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PERUSAHAAN }));

    await updateCompanyAdmin(klien(fetch), PERUSAHAAN.id, { inclusivityStatus: "unverified" });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ inclusivityStatus: "unverified" });
  });

  it("id disisipkan aman lewat encodeURIComponent", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PERUSAHAAN }));

    await updateCompanyAdmin(klien(fetch), "id aneh/lain", { name: "x" });

    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/admin/companies/id%20aneh%2Flain");
  });
});

describe("verifyCompanyAdmin", () => {
  it("mengirim POST TANPA badan ke /admin/companies/:id/verify", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: { ...PERUSAHAAN, inclusivityStatus: "verified" } }),
    );

    const hasil = await verifyCompanyAdmin(klien(fetch), PERUSAHAAN.id);

    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://x/api/v1/admin/companies/${PERUSAHAAN.id}/verify`,
    );
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(hasil.inclusivityStatus).toBe("verified");
  });
});

const PERUSAHAAN_PUBLIK = {
  id: PERUSAHAAN.id,
  name: PERUSAHAAN.name,
  description: PERUSAHAAN.description,
  website: PERUSAHAAN.website,
  city: PERUSAHAAN.city,
  inclusivityStatus: PERUSAHAAN.inclusivityStatus,
  accommodationsAvailable: PERUSAHAAN.accommodationsAvailable,
  verifiedAt: PERUSAHAAN.verifiedAt,
};

describe("getCompanyPublic", () => {
  it("memanggil GET /companies/:id dan membuka amplop `{ data }` (hanya field publik)", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PERUSAHAAN }));

    await expect(getCompanyPublic(klien(fetch), PERUSAHAAN.id)).resolves.toEqual(PERUSAHAAN_PUBLIK);
    expect(fetch.mock.calls[0]?.[0]).toBe(`https://x/api/v1/companies/${PERUSAHAAN.id}`);
  });

  it("id disisipkan aman lewat encodeURIComponent", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PERUSAHAAN }));

    await getCompanyPublic(klien(fetch), "id aneh/lain");

    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/companies/id%20aneh%2Flain");
  });

  it("jawaban yang menyimpang dari kontrak ditolak", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: { name: 42 } }));

    await expect(getCompanyPublic(klien(fetch), PERUSAHAAN.id)).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
  });
});

describe("getCompanyActiveJobs", () => {
  const LOWONGAN = {
    id: "01912345-89ab-7def-8123-456789abcd01",
    title: "Staf Admin",
    employmentType: "full_time",
    workMode: "onsite",
    city: "Jakarta",
    province: "DKI Jakarta",
    publishedAt: "2026-08-10T00:00:00.000Z",
  };

  it("memanggil GET /companies/:id/jobs dan membuka amplop `{ data }`", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [LOWONGAN] }));

    await expect(getCompanyActiveJobs(klien(fetch), PERUSAHAAN.id)).resolves.toEqual([LOWONGAN]);
    expect(fetch.mock.calls[0]?.[0]).toBe(`https://x/api/v1/companies/${PERUSAHAAN.id}/jobs`);
  });

  it("jawaban yang menyimpang dari kontrak ditolak", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ title: 42 }] }));

    await expect(getCompanyActiveJobs(klien(fetch), PERUSAHAAN.id)).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
  });
});

describe("companiesKeys", () => {
  it("adminList() tanpa params — daftar sama untuk semua admin", () => {
    expect(companiesKeys.adminList()).toEqual(["admin-companies"]);
  });

  it("public(id) dan activeJobs(id) dilingkupi id", () => {
    expect(companiesKeys.public(PERUSAHAAN.id)).toEqual(["company-public", { id: PERUSAHAAN.id }]);
    expect(companiesKeys.activeJobs(PERUSAHAAN.id)).toEqual([
      "company-active-jobs",
      { id: PERUSAHAAN.id },
    ]);
  });
});
