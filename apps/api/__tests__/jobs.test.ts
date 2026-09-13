// Unit test service `jobs` (PR-055) — repository & audit palsu di memori.
//
// Yang dijaga di sini: state machine draft→published→closed (transisi ilegal
// ditolak, tidak ada jalan mundur), validasi akomodasi sebelum publish, event
// `job.published`/`job.closed`, dan redaksi gaji berdasar `salaryVisible`.
// Alur HTTP penuh (RBAC, taksonomi, delete FK Restrict) ada di jobs-http.test.ts.
import { describe, it, expect } from "vitest";
import { createJobsService } from "../src/modules/jobs/services/jobs.service.js";
import type {
  JobCreateResult,
  JobDeleteResult,
  JobRow,
  JobsRepository,
} from "../src/modules/jobs/repositories/jobs.repository.js";
import type { AppError } from "../src/core/http/index.js";
import { busUji } from "./helpers/events.js";

const ADMIN = "018f4c1e-0000-7000-8000-0000000000ad";
const REQ = "018f4c1e-0000-7000-8000-0000000000rq";
const PERUSAHAAN_ID = "018f4c1e-0000-7000-8000-000000000c01";

function barisBaru(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "018f4c1e-0000-7000-8000-000000000j01",
    companyId: PERUSAHAAN_ID,
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
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

interface OpsiRepo {
  perusahaanValid?: Set<string>;
  berlamaran?: Set<string>;
}

function fakeRepo(rows: JobRow[], opsi: OpsiRepo = {}): JobsRepository {
  const perusahaanValid = opsi.perusahaanValid ?? new Set(rows.map((r) => r.companyId));
  const berlamaran = opsi.berlamaran ?? new Set<string>();

  return {
    listAdmin: () => Promise.resolve(rows.map((r) => ({ ...r }))),

    findById: (id) => {
      const row = rows.find((r) => r.id === id);
      return Promise.resolve(row === undefined ? null : { ...row });
    },

    listActiveByCompany: (companyId) => {
      const saatIni = new Date();
      const hasil = rows.filter(
        (r) =>
          r.companyId === companyId &&
          r.status === "published" &&
          (r.expiresAt === null || r.expiresAt > saatIni),
      );
      return Promise.resolve(hasil.map((r) => ({ ...r })));
    },

    create: (id, data): Promise<JobCreateResult> => {
      if (!perusahaanValid.has(data.companyId)) return Promise.resolve("perusahaan-tidak-ada");
      const row = barisBaru({ ...data, id, status: "draft", source: "admin_curated" });
      rows.push(row);
      return Promise.resolve({ ...row });
    },

    update: (id, patch) => {
      const row = rows.find((r) => r.id === id);
      if (row === undefined) return Promise.resolve(null);
      Object.assign(row, patch);
      return Promise.resolve({ ...row });
    },

    publish: (id, publishedAt) => {
      const row = rows.find((r) => r.id === id);
      if (row === undefined) return Promise.resolve(null);
      row.status = "published";
      row.publishedAt = publishedAt;
      return Promise.resolve({ ...row });
    },

    close: (id) => {
      const row = rows.find((r) => r.id === id);
      if (row === undefined) return Promise.resolve(null);
      row.status = "closed";
      return Promise.resolve({ ...row });
    },

    delete: (id): Promise<JobDeleteResult> => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return Promise.resolve("tidak-ditemukan");
      if (berlamaran.has(id)) return Promise.resolve("berlamaran");
      rows.splice(idx, 1);
      return Promise.resolve("dihapus");
    },
  };
}

interface Jejak {
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
}

function boot(rows: JobRow[], opsi: OpsiRepo = {}) {
  const audit: Jejak[] = [];
  const events = busUji();
  const service = createJobsService({
    jobsRepository: fakeRepo(rows, opsi),
    auditLog: (_actor, action, entity, entityId, meta) => {
      audit.push({ action, entity, entityId, meta });
    },
    events,
    clock: () => new Date("2026-08-21T10:00:00.000Z"),
  });
  return { service, audit, events };
}

describe("jobs.service — getPublic", () => {
  it("lowongan published tanpa tenggat → tampil", async () => {
    const { service } = boot([barisBaru({ status: "published", publishedAt: new Date() })]);
    const hasil = await service.getPublic(barisBaru().id);
    expect(hasil.id).toBe(barisBaru().id);
  });

  it("lowongan published dengan tenggat MASA DEPAN → tampil", async () => {
    const { service } = boot([
      barisBaru({
        status: "published",
        publishedAt: new Date(),
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      }),
    ]);
    await expect(service.getPublic(barisBaru().id)).resolves.toMatchObject({});
  });

  it("lowongan published tetapi LEWAT tenggat → 404 (bukan draft/closed yang bocor)", async () => {
    const { service } = boot([
      barisBaru({
        status: "published",
        expiresAt: new Date("2020-01-01T00:00:00Z"),
      }),
    ]);
    await expect(service.getPublic(barisBaru().id)).rejects.toMatchObject({
      code: "LOWONGAN_TIDAK_DITEMUKAN",
    });
  });

  it("lowongan draft → 404", async () => {
    const { service } = boot([barisBaru({ status: "draft" })]);
    await expect(service.getPublic(barisBaru().id)).rejects.toMatchObject({
      code: "LOWONGAN_TIDAK_DITEMUKAN",
    });
  });

  it("lowongan closed → 404", async () => {
    const { service } = boot([barisBaru({ status: "closed" })]);
    await expect(service.getPublic(barisBaru().id)).rejects.toMatchObject({
      code: "LOWONGAN_TIDAK_DITEMUKAN",
    });
  });

  it("tidak ada sama sekali → 404", async () => {
    const { service } = boot([]);
    await expect(
      service.getPublic("018f4c1e-0000-7000-8000-00000000dead"),
    ).rejects.toMatchObject({ code: "LOWONGAN_TIDAK_DITEMUKAN" } satisfies Partial<AppError>);
  });

  it("salaryVisible=false → salaryMin/salaryMax disembunyikan (null)", async () => {
    const { service } = boot([
      barisBaru({
        status: "published",
        salaryVisible: false,
        salaryMin: 5_000_000,
        salaryMax: 8_000_000,
      }),
    ]);
    const hasil = await service.getPublic(barisBaru().id);
    expect(hasil.salaryMin).toBeNull();
    expect(hasil.salaryMax).toBeNull();
  });

  it("salaryVisible=true → salaryMin/salaryMax tampil apa adanya", async () => {
    const { service } = boot([
      barisBaru({ status: "published", salaryVisible: true, salaryMin: 5_000_000, salaryMax: 8_000_000 }),
    ]);
    const hasil = await service.getPublic(barisBaru().id);
    expect(hasil.salaryMin).toBe(5_000_000);
    expect(hasil.salaryMax).toBe(8_000_000);
  });

  it("bentuknya TIDAK memuat status/source/createdBy (field internal)", async () => {
    const { service } = boot([barisBaru({ status: "published" })]);
    const hasil = await service.getPublic(barisBaru().id);
    expect(hasil).not.toHaveProperty("status");
    expect(hasil).not.toHaveProperty("source");
    expect(hasil).not.toHaveProperty("createdBy");
    expect(hasil).not.toHaveProperty("salaryVisible");
  });
});

describe("jobs.service — listActiveByCompany (dipakai modul companies)", () => {
  it("mengembalikan ringkasan lowongan published milik satu perusahaan", async () => {
    const { service } = boot([
      barisBaru({ status: "published", publishedAt: new Date("2026-08-10T00:00:00Z") }),
      barisBaru({ id: "018f4c1e-0000-7000-8000-000000000j02", status: "draft" }),
    ]);
    const hasil = await service.listActiveByCompany(PERUSAHAAN_ID);
    expect(hasil).toEqual([
      expect.objectContaining({ id: barisBaru().id, title: "Staf Admin" }),
    ]);
  });
});

describe("jobs.service — listAdmin", () => {
  it("mengembalikan seluruh lowongan, termasuk field internal", async () => {
    const { service } = boot([barisBaru({ status: "draft" })]);
    const hasil = await service.listAdmin();
    expect(hasil[0]).toMatchObject({ status: "draft", source: "admin_curated" });
  });
});

describe("jobs.service — create", () => {
  it("lowongan baru lahir draft, audit ADMIN_RESOURCE_CHANGED operation=create", async () => {
    const { service, audit } = boot([], { perusahaanValid: new Set([PERUSAHAAN_ID]) });

    const hasil = await service.create(
      { userId: ADMIN, requestId: REQ },
      {
        companyId: PERUSAHAAN_ID,
        title: "Kasir",
        description: "Melayani pelanggan",
        requirements: null,
        employmentType: "part_time",
        workMode: "onsite",
        city: null,
        province: null,
        salaryMin: null,
        salaryMax: null,
        salaryVisible: true,
        accommodations: [],
        welcomedDisabilityTypes: [],
      },
    );

    expect(hasil.status).toBe("draft");
    expect(audit[0]).toMatchObject({ meta: { operation: "create" } });
  });

  it("companyId tidak menunjuk perusahaan yang ada → PERUSAHAAN_TIDAK_DITEMUKAN, tanpa audit", async () => {
    const { service, audit } = boot([], { perusahaanValid: new Set() });

    await expect(
      service.create(
        { userId: ADMIN, requestId: REQ },
        {
          companyId: "018f4c1e-0000-7000-8000-00000000dead",
          title: "Kasir",
          description: "Melayani pelanggan",
          requirements: null,
          employmentType: "part_time",
          workMode: "onsite",
          city: null,
          province: null,
          salaryMin: null,
          salaryMax: null,
          salaryVisible: true,
          accommodations: [],
          welcomedDisabilityTypes: [],
        },
      ),
    ).rejects.toMatchObject({ code: "PERUSAHAAN_TIDAK_DITEMUKAN" });
    expect(audit).toHaveLength(0);
  });
});

describe("jobs.service — update", () => {
  it("patch sebagian → audit operation=update", async () => {
    const { service, audit } = boot([barisBaru()]);

    const hasil = await service.update({ userId: ADMIN, requestId: REQ }, barisBaru().id, {
      title: "Staf Admin Senior",
    });

    expect(hasil.title).toBe("Staf Admin Senior");
    expect(audit[0]).toMatchObject({ meta: { operation: "update" } });
  });

  it("expiresAt string ISO diterjemahkan dan dipantulkan balik apa adanya", async () => {
    const { service } = boot([barisBaru()]);

    const hasil = await service.update({ userId: ADMIN, requestId: REQ }, barisBaru().id, {
      expiresAt: "2026-12-31T00:00:00.000Z",
    });

    expect(hasil.expiresAt).toBe("2026-12-31T00:00:00.000Z");
  });

  it("id tidak ada → LOWONGAN_TIDAK_DITEMUKAN", async () => {
    const { service } = boot([]);
    await expect(
      service.update({ userId: ADMIN, requestId: REQ }, "018f4c1e-0000-7000-8000-00000000dead", {
        title: "Apapun",
      }),
    ).rejects.toMatchObject({ code: "LOWONGAN_TIDAK_DITEMUKAN" });
  });
});

describe("jobs.service — publish", () => {
  it("draft + akomodasi terisi → published, audit, event job.published", async () => {
    const { service, audit, events } = boot([
      barisBaru({ status: "draft", accommodations: ["akses_kursi_roda"] }),
    ]);
    const diterima: unknown[] = [];
    events.on("job.published", (p) => { diterima.push(p); });

    const hasil = await service.publish({ userId: ADMIN, requestId: REQ }, barisBaru().id);

    expect(hasil.status).toBe("published");
    expect(hasil.publishedAt).toBe("2026-08-21T10:00:00.000Z");
    expect(audit[0]).toMatchObject({ meta: { operation: "publish" } });
    expect(diterima).toEqual([
      {
        jobId: barisBaru().id,
        companyId: PERUSAHAAN_ID,
        publishedAt: "2026-08-21T10:00:00.000Z",
      },
    ]);
  });

  it("draft TANPA akomodasi → 422 AKOMODASI_LOWONGAN_KOSONG, tanpa audit/event", async () => {
    const { service, audit, events } = boot([barisBaru({ status: "draft", accommodations: [] })]);
    const diterima: unknown[] = [];
    events.on("job.published", (p) => { diterima.push(p); });

    await expect(
      service.publish({ userId: ADMIN, requestId: REQ }, barisBaru().id),
    ).rejects.toMatchObject({ code: "AKOMODASI_LOWONGAN_KOSONG" });
    expect(audit).toHaveLength(0);
    expect(diterima).toHaveLength(0);
  });

  it("sudah published → 409 TRANSISI_STATUS_TIDAK_VALID (bukan idempoten)", async () => {
    const { service, audit } = boot([
      barisBaru({ status: "published", accommodations: ["akses_kursi_roda"] }),
    ]);
    await expect(
      service.publish({ userId: ADMIN, requestId: REQ }, barisBaru().id),
    ).rejects.toMatchObject({ code: "TRANSISI_STATUS_TIDAK_VALID" });
    expect(audit).toHaveLength(0);
  });

  it("closed → 409 TRANSISI_STATUS_TIDAK_VALID", async () => {
    const { service } = boot([
      barisBaru({ status: "closed", accommodations: ["akses_kursi_roda"] }),
    ]);
    await expect(
      service.publish({ userId: ADMIN, requestId: REQ }, barisBaru().id),
    ).rejects.toMatchObject({ code: "TRANSISI_STATUS_TIDAK_VALID" });
  });

  it("tidak ada → LOWONGAN_TIDAK_DITEMUKAN", async () => {
    const { service } = boot([]);
    await expect(
      service.publish({ userId: ADMIN, requestId: REQ }, "018f4c1e-0000-7000-8000-00000000dead"),
    ).rejects.toMatchObject({ code: "LOWONGAN_TIDAK_DITEMUKAN" });
  });
});

describe("jobs.service — close", () => {
  it("published → closed, audit, event job.closed reason=closed_by_admin", async () => {
    const { service, audit, events } = boot([barisBaru({ status: "published" })]);
    const diterima: unknown[] = [];
    events.on("job.closed", (p) => { diterima.push(p); });

    const hasil = await service.close({ userId: ADMIN, requestId: REQ }, barisBaru().id);

    expect(hasil.status).toBe("closed");
    expect(audit[0]).toMatchObject({ meta: { operation: "close" } });
    expect(diterima).toEqual([
      {
        jobId: barisBaru().id,
        closedAt: "2026-08-21T10:00:00.000Z",
        reason: "closed_by_admin",
      },
    ]);
  });

  it("draft → 409 TRANSISI_STATUS_TIDAK_VALID, tanpa audit/event", async () => {
    const { service, audit, events } = boot([barisBaru({ status: "draft" })]);
    const diterima: unknown[] = [];
    events.on("job.closed", (p) => { diterima.push(p); });

    await expect(
      service.close({ userId: ADMIN, requestId: REQ }, barisBaru().id),
    ).rejects.toMatchObject({ code: "TRANSISI_STATUS_TIDAK_VALID" });
    expect(audit).toHaveLength(0);
    expect(diterima).toHaveLength(0);
  });

  it("sudah closed → 409 TRANSISI_STATUS_TIDAK_VALID (tidak idempoten)", async () => {
    const { service } = boot([barisBaru({ status: "closed" })]);
    await expect(
      service.close({ userId: ADMIN, requestId: REQ }, barisBaru().id),
    ).rejects.toMatchObject({ code: "TRANSISI_STATUS_TIDAK_VALID" });
  });

  it("tidak ada → LOWONGAN_TIDAK_DITEMUKAN", async () => {
    const { service } = boot([]);
    await expect(
      service.close({ userId: ADMIN, requestId: REQ }, "018f4c1e-0000-7000-8000-00000000dead"),
    ).rejects.toMatchObject({ code: "LOWONGAN_TIDAK_DITEMUKAN" });
  });
});

describe("jobs.service — remove (delete)", () => {
  it("lowongan tanpa lamaran → dihapus, audit operation=delete", async () => {
    const rows = [barisBaru()];
    const { service, audit } = boot(rows);

    await service.remove({ userId: ADMIN, requestId: REQ }, barisBaru().id);

    expect(rows).toHaveLength(0);
    expect(audit[0]).toMatchObject({ meta: { operation: "delete" } });
  });

  it("lowongan berlamaran → 409 LOWONGAN_BERLAMARAN_TIDAK_BISA_DIHAPUS, tanpa audit, baris tetap ada", async () => {
    const rows = [barisBaru()];
    const { service, audit } = boot(rows, { berlamaran: new Set([barisBaru().id]) });

    await expect(
      service.remove({ userId: ADMIN, requestId: REQ }, barisBaru().id),
    ).rejects.toMatchObject({ code: "LOWONGAN_BERLAMARAN_TIDAK_BISA_DIHAPUS" });
    expect(rows).toHaveLength(1);
    expect(audit).toHaveLength(0);
  });

  it("tidak ada → LOWONGAN_TIDAK_DITEMUKAN", async () => {
    const { service, audit } = boot([]);
    await expect(
      service.remove({ userId: ADMIN, requestId: REQ }, "018f4c1e-0000-7000-8000-00000000dead"),
    ).rejects.toMatchObject({ code: "LOWONGAN_TIDAK_DITEMUKAN" });
    expect(audit).toHaveLength(0);
  });
});
