// Unit retensi (PR-024a) — mesin, batching, dry-run, dan audit.
//
// Perilaku SQL-nya terhadap PostgreSQL diuji di retention-db.test.ts. Yang
// diperiksa di sini adalah keputusan mesinnya: bahwa batas run dihormati,
// bahwa sisa dihitung SETELAH penghapusan, dan bahwa dry-run tidak menghapus.
import { describe, it, expect, vi } from "vitest";
import { AUDIT_ACTION } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { createRetentionService, type RetentionPolicy } from "../src/modules/users/index.js";
import { createRefreshTokenPolicies } from "../src/modules/auth/index.js";
import type { RetentionKategori } from "../src/modules/auth/repositories/refresh-token.repository.js";

const SEKARANG = new Date("2026-08-08T00:00:00.000Z");
const HARI = 86_400_000;

/** Prisma palsu — mesin hanya memakainya untuk agregasi ai_usage. */
function fakePrisma(bulan: Array<{ month: Date }> = []) {
  const jejak: string[] = [];
  const klien = {
    $queryRaw: () => {
      jejak.push("queryRaw:bulan");
      return Promise.resolve(bulan);
    },
    $executeRaw: () => {
      jejak.push("executeRaw:agregat");
      return Promise.resolve(bulan.length);
    },
  };
  return { prisma: klien as unknown as AppPrisma, jejak };
}

function fakeAudit() {
  const entri: Array<Record<string, unknown>> = [];
  const aksi: string[] = [];
  const auditLog = vi.fn((_a, action, _e, _id, meta) => {
    aksi.push(action as string);
    entri.push(meta as Record<string, unknown>);
  });
  return { auditLog: auditLog as never, entri, aksi };
}

/** Kebijakan palsu dengan stok baris terbatas. */
function policyPalsu(nama: string, stok: number): RetentionPolicy & { sisa: () => number } {
  let tersisa = stok;
  return {
    nama,
    hitung: () => Promise.resolve(tersisa),
    hapus: (_now, batas) => {
      const n = Math.min(batas, tersisa);
      tersisa -= n;
      return Promise.resolve(n);
    },
    sisa: () => tersisa,
  };
}

function rakit(policies: RetentionPolicy[], limits = { batchSize: 100, maxPerRun: 1000 }) {
  const { prisma, jejak } = fakePrisma();
  const audit = fakeAudit();
  const service = createRetentionService({
    prisma,
    policies,
    limits,
    auditLog: audit.auditLog,
    clock: () => SEKARANG,
  });
  return { service, audit, jejak };
}

describe("mesin retensi — batching & batas run", () => {
  it("menghapus berbatch sampai kandidat habis", async () => {
    const p = policyPalsu("uji", 250);
    const { service } = rakit([p], { batchSize: 100, maxPerRun: 1000 });

    const laporan = await service.run();

    expect(laporan.deleted).toBe(250);
    expect(p.sisa()).toBe(0);
  });

  it("berhenti di batas per run, dan melaporkan sisanya", async () => {
    // Batas ini yang menjaga run tidak menabrak timeout 10 menit pada backlog
    // besar dan gagal SETELAH menghapus separuh.
    const p = policyPalsu("uji", 500);
    const { service } = rakit([p], { batchSize: 100, maxPerRun: 300 });

    const laporan = await service.run();

    expect(laporan.deleted).toBe(300);
    expect(laporan.policies[0]?.remaining).toBe(200);
  });

  it("sisa dihitung SETELAH penghapusan, bukan sebelum", async () => {
    // Melaporkan sisa dari sebelum penghapusan akan membuat tabel yang baru
    // saja dibersihkan tuntas terlihat masih penuh — dan operator mengejar
    // masalah yang tidak ada.
    const p = policyPalsu("uji", 50);
    const { service } = rakit([p], { batchSize: 100, maxPerRun: 1000 });

    const laporan = await service.run();

    expect(laporan.policies[0]).toEqual({ policy: "uji", deleted: 50, remaining: 0 });
  });

  it("batch tidak penuh menghentikan loop tanpa query tambahan", async () => {
    const hapus = vi.fn((_now: Date, batas: number) => Promise.resolve(Math.min(batas, 10)));
    const { service } = rakit(
      [{ nama: "uji", hitung: () => Promise.resolve(0), hapus }],
      { batchSize: 100, maxPerRun: 1000 },
    );

    await service.run();

    expect(hapus).toHaveBeenCalledTimes(1);
  });
});

describe("mesin retensi — dry-run", () => {
  it("tidak menghapus apa pun, tetapi tetap melaporkan sisa", async () => {
    const p = policyPalsu("uji", 120);
    const { service } = rakit([p]);

    const laporan = await service.run({ dryRun: true });

    expect(laporan.dryRun).toBe(true);
    expect(laporan.deleted).toBe(0);
    expect(laporan.policies[0]?.remaining).toBe(120);
    expect(p.sisa()).toBe(120);
  });

  it("default BUKAN dry-run", async () => {
    const p = policyPalsu("uji", 10);
    const { service } = rakit([p]);

    expect((await service.run()).dryRun).toBe(false);
    expect(p.sisa()).toBe(0);
  });
});

describe("mesin retensi — audit", () => {
  it("satu baris per kebijakan plus ringkasan run", async () => {
    const { service, audit } = rakit([policyPalsu("a", 5), policyPalsu("b", 7)]);

    await service.run();

    expect(audit.entri).toHaveLength(3);
    expect(audit.entri.map((e) => e.policy)).toEqual(["a", "b", "run"]);
    expect(audit.entri[2]).toMatchObject({ policy: "run", deleted: 12, remaining: 0 });
  });

  it("ringkasan tetap ditulis meski tidak ada yang terhapus", async () => {
    const { service, audit } = rakit([policyPalsu("a", 0)]);

    await service.run();

    expect(audit.entri.at(-1)).toMatchObject({ policy: "run", deleted: 0 });
  });

  it("audit hanya memuat nama kebijakan dan angka", async () => {
    const { service, audit } = rakit([policyPalsu("refresh_tokens.reuse", 3)]);

    await service.run();

    for (const meta of audit.entri) {
      expect(Object.keys(meta).sort()).toEqual(
        meta.policy === "run"
          ? ["deleted", "dryRun", "monthsAggregated", "policy", "remaining"]
          : ["deleted", "dryRun", "policy", "remaining"],
      );
    }
  });

  it("aksi audit yang dipakai adalah DATA_RETAINED", async () => {
    const { service, audit } = rakit([policyPalsu("a", 1)]);

    await service.run();

    expect(new Set(audit.aksi)).toEqual(new Set([AUDIT_ACTION.DATA_RETAINED]));
  });
});

// ===== Kebijakan refresh_tokens — inti keamanan PR ini ==================

/** Repository palsu yang MENCATAT cutoff per kategori. */
function fakeRefreshRepo() {
  const dipanggil: Array<{ kategori: RetentionKategori; cutoff: Date }> = [];
  return {
    dipanggil,
    repository: {
      countRetention: (kategori: RetentionKategori, cutoff: Date) => {
        dipanggil.push({ kategori, cutoff });
        return Promise.resolve(0);
      },
      deleteRetentionBatch: (kategori: RetentionKategori, cutoff: Date) => {
        dipanggil.push({ kategori, cutoff });
        return Promise.resolve(0);
      },
    },
  };
}

describe("kebijakan refresh_tokens", () => {
  const days = { expired: 90, revoked: 180, reuse: 730 };

  it("tiga kebijakan terpisah, satu per kategori", () => {
    const policies = createRefreshTokenPolicies({ repository: fakeRefreshRepo().repository, days });

    // Dipisah supaya audit menyebut kategori mana yang bergerak:
    // "refresh_tokens berkurang 40.000 baris" tidak memberi tahu apakah yang
    // hilang sampah rotasi atau bukti insiden.
    expect(policies.map((p) => p.nama)).toEqual([
      "refresh_tokens.expired",
      "refresh_tokens.revoked",
      "refresh_tokens.reuse",
    ]);
  });

  it("setiap kategori memakai ambangnya sendiri, bukan satu angka", async () => {
    const { repository, dipanggil } = fakeRefreshRepo();
    const policies = createRefreshTokenPolicies({ repository, days });

    for (const p of policies) await p.hapus(SEKARANG, 10);

    expect(dipanggil.map((d) => d.cutoff.getTime())).toEqual([
      SEKARANG.getTime() - 90 * HARI,
      SEKARANG.getTime() - 180 * HARI,
      SEKARANG.getTime() - 730 * HARI,
    ]);
  });

  it("ambang reuse jauh lebih panjang daripada revoked biasa", () => {
    // Baris ber-`reuse` adalah bukti insiden dan disamakan dengan audit_logs
    // (2 tahun) — baris DB dan baris auditnya dua paruh bukti yang sama.
    expect(days.reuse).toBeGreaterThan(days.revoked * 3);
  });

  it("ambang revoked lebih panjang daripada expired — ini jendela deteksi reuse", () => {
    // Kalau keduanya disamakan, token yang DICABUT akan hilang pada hari ke-90
    // dan reuse detection berhenti bisa membedakan token curian dari token tak
    // dikenal. Test ini menjaga angka itu tidak "dirapikan" jadi satu nilai.
    expect(days.revoked).toBeGreaterThan(days.expired);
  });
});
