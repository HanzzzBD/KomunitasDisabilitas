// Unit test service `companies` (PR-051) — repository & audit palsu di memori.
//
// Yang dijaga di sini: logika verifikasi (audit `from`/`to`, event, dan
// pemetaan status DB snake_case → meta audit camelCase yang sudah dikontrak
// `auditMetaSchemas[COMPANY_VERIFIED]` sejak PR-014). Alur HTTP penuh (RBAC,
// validasi taksonomi, un-verify via PUT) ada di companies-http.test.ts.
import { describe, it, expect } from "vitest";
import { AUDIT_ACTION, auditMetaSchemas } from "@nawasena/schemas";
import { createCompaniesService } from "../src/modules/companies/services/companies.service.js";
import type {
  CompaniesRepository,
  CompanyRow,
} from "../src/modules/companies/repositories/companies.repository.js";
import type { AppError } from "../src/core/http/index.js";
import { busUji } from "./helpers/events.js";

const ADMIN = "018f4c1e-0000-7000-8000-0000000000ad";
const REQ = "018f4c1e-0000-7000-8000-0000000000rq";

function barisBaru(overrides: Partial<CompanyRow> = {}): CompanyRow {
  return {
    id: "018f4c1e-0000-7000-8000-000000000001",
    name: "PT Uji Fiktif",
    description: null,
    website: null,
    city: null,
    inclusivityStatus: "unverified",
    accommodationsAvailable: [],
    verifiedBy: null,
    verifiedAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

function fakeRepo(rows: CompanyRow[]): CompaniesRepository {
  return {
    listAll: () => Promise.resolve(rows.map((r) => ({ ...r }))),
    // SALINAN, bukan referensi — Prisma sungguhan tidak pernah mengembalikan
    // objek yang sama dengan baris yang kemudian diperbarui (lihat komentar
    // serupa di profiles-http.test.ts `fakePrisma`).
    findById: (id) => {
      const row = rows.find((r) => r.id === id);
      return Promise.resolve(row === undefined ? null : { ...row });
    },
    create: (id, data) => {
      const row = barisBaru({ id, ...data });
      rows.push(row);
      return Promise.resolve(row);
    },
    update: (id, patch) => {
      const row = rows.find((r) => r.id === id);
      if (row === undefined) return Promise.resolve(null);
      Object.assign(row, patch);
      return Promise.resolve({ ...row });
    },
    verify: (id, verifiedBy, verifiedAt) => {
      const row = rows.find((r) => r.id === id);
      if (row === undefined) return Promise.resolve(null);
      row.inclusivityStatus = "verified";
      row.verifiedBy = verifiedBy;
      row.verifiedAt = verifiedAt;
      return Promise.resolve({ ...row });
    },
  };
}

interface Jejak {
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
}

function boot(rows: CompanyRow[]) {
  const audit: Jejak[] = [];
  const events = busUji();
  const service = createCompaniesService({
    companiesRepository: fakeRepo(rows),
    auditLog: (_actor, action, entity, entityId, meta) => {
      audit.push({ action, entity, entityId, meta });
    },
    events,
    clock: () => new Date("2026-08-21T10:00:00.000Z"),
  });
  return { service, audit, events };
}

describe("companies.service — verify", () => {
  it("perusahaan unverified → verified: audit from=unverified to=verified", async () => {
    const { service, audit } = boot([barisBaru()]);

    const hasil = await service.verify({ userId: ADMIN, requestId: REQ }, barisBaru().id);

    expect(hasil.inclusivityStatus).toBe("verified");
    expect(hasil.verifiedBy).toBe(ADMIN);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: AUDIT_ACTION.COMPANY_VERIFIED,
      entity: "companies.company",
      entityId: barisBaru().id,
      meta: { from: "unverified", to: "verified" },
    });
  });

  it("self_claimed → verified: meta from dipetakan ke 'selfClaimed' (kontrak audit.ts PR-014)", async () => {
    const { service, audit } = boot([barisBaru({ inclusivityStatus: "self_claimed" })]);

    await service.verify({ userId: ADMIN, requestId: REQ }, barisBaru().id);

    expect(audit[0]?.meta).toEqual({ from: "selfClaimed", to: "verified" });
  });

  it("setiap meta COMPANY_VERIFIED lolos sanitizer katalog audit", async () => {
    const { service, audit } = boot([barisBaru()]);

    await service.verify({ userId: ADMIN, requestId: REQ }, barisBaru().id);

    const skema = auditMetaSchemas[AUDIT_ACTION.COMPANY_VERIFIED];
    expect(skema.safeParse(audit[0]?.meta).success, JSON.stringify(audit[0]?.meta)).toBe(true);
  });

  it("re-verifikasi perusahaan yang SUDAH verified: from=verified (idempoten, bukan error)", async () => {
    const sudahVerified = barisBaru({
      inclusivityStatus: "verified",
      verifiedBy: "018f4c1e-0000-7000-8000-0000000000ae",
      verifiedAt: new Date("2026-07-01T00:00:00Z"),
    });
    const { service, audit } = boot([sudahVerified]);

    const hasil = await service.verify({ userId: ADMIN, requestId: REQ }, sudahVerified.id);

    expect(hasil.verifiedBy).toBe(ADMIN); // verifikator terbaru menggantikan yang lama
    expect(audit[0]?.meta).toMatchObject({ from: "verified", to: "verified" });
  });

  it("menerbitkan event company.verified dengan companyId + verifiedBy + verifiedAt", async () => {
    const { service, events } = boot([barisBaru()]);
    const diterima: unknown[] = [];
    events.on("company.verified", (payload) => {
      diterima.push(payload);
    });

    await service.verify({ userId: ADMIN, requestId: REQ }, barisBaru().id);

    expect(diterima).toEqual([
      { companyId: barisBaru().id, verifiedBy: ADMIN, verifiedAt: "2026-08-21T10:00:00.000Z" },
    ]);
  });

  it("perusahaan tidak ada → PERUSAHAAN_TIDAK_DITEMUKAN, tanpa audit/event", async () => {
    const { service, audit, events } = boot([]);
    const diterima: unknown[] = [];
    events.on("company.verified", (p) => {
      diterima.push(p);
    });

    await expect(
      service.verify({ userId: ADMIN, requestId: REQ }, "018f4c1e-0000-7000-8000-00000000dead"),
    ).rejects.toMatchObject({ code: "PERUSAHAAN_TIDAK_DITEMUKAN" } satisfies Partial<AppError>);
    expect(audit).toHaveLength(0);
    expect(diterima).toHaveLength(0);
  });
});

describe("companies.service — update (koreksi status)", () => {
  it("PUT dengan inclusivityStatus unverified/self_claimed → tersimpan (un-verify)", async () => {
    const row = barisBaru({ inclusivityStatus: "verified" });
    const { service, audit } = boot([row]);

    const hasil = await service.update({ userId: ADMIN, requestId: REQ }, row.id, {
      inclusivityStatus: "unverified",
    });

    expect(hasil.inclusivityStatus).toBe("unverified");
    expect(audit[0]).toMatchObject({
      action: AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
      meta: { operation: "update" },
    });
  });

  it("perusahaan tidak ada → PERUSAHAAN_TIDAK_DITEMUKAN", async () => {
    const { service } = boot([]);
    await expect(
      service.update({ userId: ADMIN, requestId: REQ }, "018f4c1e-0000-7000-8000-00000000dead", {
        name: "Baru",
      }),
    ).rejects.toMatchObject({ code: "PERUSAHAAN_TIDAK_DITEMUKAN" });
  });
});

describe("companies.service — create", () => {
  it("perusahaan baru lahir dengan audit ADMIN_RESOURCE_CHANGED operation=create", async () => {
    const { service, audit } = boot([]);

    const hasil = await service.create(
      { userId: ADMIN, requestId: REQ },
      { name: "Toko Baru", description: null, website: null, city: null, accommodationsAvailable: [] },
    );

    expect(hasil.inclusivityStatus).toBe("unverified");
    expect(audit[0]).toMatchObject({ meta: { operation: "create" } });
  });
});

describe("companies.service — getPublic", () => {
  it("perusahaan tidak ada → PERUSAHAAN_TIDAK_DITEMUKAN", async () => {
    const { service } = boot([]);
    await expect(service.getPublic("018f4c1e-0000-7000-8000-00000000dead")).rejects.toMatchObject({
      code: "PERUSAHAAN_TIDAK_DITEMUKAN",
    });
  });

  it("bentuknya TIDAK memuat verifiedBy (field internal)", async () => {
    const { service } = boot([barisBaru({ verifiedBy: ADMIN })]);
    const hasil = await service.getPublic(barisBaru().id);
    expect(hasil).not.toHaveProperty("verifiedBy");
  });
});
