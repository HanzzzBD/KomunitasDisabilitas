// Unit test service `jobs.search` (PR-056) — repository palsu di memori.
//
// Yang dijaga di sini: logika pagination (limit+1/hasMore/nextCursor, pola
// sama `notifications.service.ts`), pemetaan filter query → filter repository
// APA ADANYA, pemetaan baris → `JobSearchResult` (termasuk `publishedAt`
// ISO string), dan cursor rusak melempar `KursorTidakValidError` alih-alih
// diam-diam dianggap halaman pertama.
//
// FTS/trigram/containment GIN SENGAJA TIDAK diuji di sini — repository palsu
// tidak menjalankan SQL sungguhan, jadi menirunya di JS hanya akan menguji
// tiruan saya sendiri (pola sama `jobs-expiry-db.test.ts`). Itu tanggung
// jawab `jobs-search-db.test.ts` (butuh PostgreSQL sungguhan).
import { describe, it, expect } from "vitest";
import { createJobsService } from "../src/modules/jobs/services/jobs.service.js";
import type {
  JobDeleteResult,
  JobSearchFilter,
  JobSearchRow,
  JobsRepository,
} from "../src/modules/jobs/repositories/jobs.repository.js";
import { encodeKursor, KursorTidakValidError } from "../src/core/pagination/index.js";
import { busUji } from "./helpers/events.js";

function barisPencarian(overrides: Partial<JobSearchRow> = {}): JobSearchRow {
  return {
    id: "018f4c1e-0000-7000-8000-000000000j01",
    companyId: "018f4c1e-0000-7000-8000-000000000c01",
    companyName: "Perusahaan Uji",
    title: "Staf Admin",
    employmentType: "full_time",
    workMode: "onsite",
    city: "Jakarta",
    province: "DKI Jakarta",
    accommodations: ["akses_kursi_roda"],
    publishedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

/** Hanya `search()` yang berarti di sini — sisanya tidak dipakai berkas ini (pola sama `jobs.test.ts`, arah terbalik). */
function fakeRepo(hasil: JobSearchRow[]): { repo: JobsRepository; panggilan: JobSearchFilter[] } {
  const panggilan: JobSearchFilter[] = [];
  const notUsed = (): never => {
    throw new Error("fakeRepo: metode ini tidak dipakai jobs-search.test.ts");
  };

  const repo: JobsRepository = {
    listAdmin: notUsed,
    findById: notUsed,
    listActiveByCompany: notUsed,
    create: notUsed as unknown as JobsRepository["create"],
    update: notUsed,
    publish: notUsed,
    close: notUsed,
    delete: notUsed as unknown as () => Promise<JobDeleteResult>,
    search: (filter) => {
      panggilan.push(filter);
      return Promise.resolve(hasil);
    },
  };

  return { repo, panggilan };
}

function rakitService(hasil: JobSearchRow[]) {
  const { repo, panggilan } = fakeRepo(hasil);
  const service = createJobsService({
    jobsRepository: repo,
    auditLog: () => {},
    events: busUji(),
  });
  return { service, panggilan };
}

describe("jobs.search — pagination", () => {
  it("limit diteruskan ke repository sebagai limit+1", async () => {
    const { service, panggilan } = rakitService([barisPencarian()]);
    await service.search({ limit: 20 });
    expect(panggilan[0]?.limit).toBe(21);
  });

  it("baris ke-(limit+1) ada → dipotong, nextCursor mengarah ke baris terakhir yang DIPERTAHANKAN", async () => {
    const b1 = barisPencarian({ id: "018f4c1e-0000-7000-8000-000000000j01" });
    const b2 = barisPencarian({
      id: "018f4c1e-0000-7000-8000-000000000j02",
      publishedAt: new Date("2026-07-31T00:00:00Z"),
    });
    const b3 = barisPencarian({
      id: "018f4c1e-0000-7000-8000-000000000j03",
      publishedAt: new Date("2026-07-30T00:00:00Z"),
    });
    const { service } = rakitService([b1, b2, b3]);

    const hasil = await service.search({ limit: 2 });

    expect(hasil.data).toHaveLength(2);
    expect(hasil.data.map((d) => d.id)).toEqual([b1.id, b2.id]);
    expect(hasil.meta.nextCursor).toBe(encodeKursor({ sortAt: b2.publishedAt, id: b2.id }));
  });

  it("baris ke-(limit+1) TIDAK ada → halaman terakhir, nextCursor null", async () => {
    const { service } = rakitService([barisPencarian()]);
    const hasil = await service.search({ limit: 20 });

    expect(hasil.data).toHaveLength(1);
    expect(hasil.meta.nextCursor).toBeNull();
  });

  it("daftar kosong → halaman kosong, nextCursor null (bukan error)", async () => {
    const { service } = rakitService([]);
    const hasil = await service.search({ limit: 20 });

    expect(hasil.data).toEqual([]);
    expect(hasil.meta.nextCursor).toBeNull();
  });
});

describe("jobs.search — filter diteruskan apa adanya ke repository", () => {
  it("query/city/province/workMode/accommodations", async () => {
    const { service, panggilan } = rakitService([]);
    await service.search({
      limit: 10,
      query: "admin",
      city: "Jakarta",
      province: "DKI Jakarta",
      workMode: "remote",
      accommodations: ["akses_kursi_roda", "juru_bahasa_isyarat"],
    });

    expect(panggilan[0]).toMatchObject({
      query: "admin",
      city: "Jakarta",
      province: "DKI Jakarta",
      workMode: "remote",
      accommodations: ["akses_kursi_roda", "juru_bahasa_isyarat"],
    });
  });

  it("filter tidak disebut → undefined, bukan nilai kosong yang mengubah arti WHERE", async () => {
    const { service, panggilan } = rakitService([]);
    await service.search({ limit: 10 });

    expect(panggilan[0]?.query).toBeUndefined();
    expect(panggilan[0]?.city).toBeUndefined();
    expect(panggilan[0]?.province).toBeUndefined();
    expect(panggilan[0]?.workMode).toBeUndefined();
    expect(panggilan[0]?.accommodations).toBeUndefined();
    expect(panggilan[0]?.cursor).toBeUndefined();
  });
});

describe("jobs.search — cursor", () => {
  it("cursor valid didekode dan diteruskan sebagai {sortAt, id}", async () => {
    const posisi = { sortAt: new Date("2026-07-01T00:00:00Z"), id: "018f4c1e-0000-7000-8000-000000000jxx" };
    const { service, panggilan } = rakitService([]);

    await service.search({ limit: 10, cursor: encodeKursor(posisi) });

    expect(panggilan[0]?.cursor).toEqual(posisi);
  });

  it("cursor rusak melempar KursorTidakValidError, BUKAN dianggap halaman pertama", async () => {
    const { service, panggilan } = rakitService([]);

    await expect(service.search({ limit: 10, cursor: "!!!tidak-base64url-yang-sah!!!" })).rejects.toThrow(
      KursorTidakValidError,
    );
    // Repository TIDAK PERNAH dipanggil — kesalahan input ditolak sebelum query.
    expect(panggilan).toHaveLength(0);
  });
});

describe("jobs.search — pemetaan hasil", () => {
  it("JobSearchResult: publishedAt ISO string, field lain apa adanya", async () => {
    const baris = barisPencarian({
      companyName: "PT Uji Inklusif",
      accommodations: ["ramah_screen_reader", "wawancara_via_teks"],
    });
    const { service } = rakitService([baris]);

    const hasil = await service.search({ limit: 10 });

    expect(hasil.data[0]).toEqual({
      id: baris.id,
      companyId: baris.companyId,
      companyName: "PT Uji Inklusif",
      title: baris.title,
      employmentType: baris.employmentType,
      workMode: baris.workMode,
      city: baris.city,
      province: baris.province,
      accommodations: ["ramah_screen_reader", "wawancara_via_teks"],
      publishedAt: baris.publishedAt.toISOString(),
    });
  });
});
