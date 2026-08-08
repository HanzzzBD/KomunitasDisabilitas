// Unit purge PDP (PR-023) — selector, dry-run, urutan operasi, dan audit.
//
// Perilaku sesungguhnya terhadap PostgreSQL diuji di users-purge-db.test.ts.
// Yang HANYA bisa diperiksa di sini adalah hal-hal yang tidak meninggalkan
// jejak di data akhir: bahwa dry-run tidak pernah membuka transaksi, dan bahwa
// `applications.resume_id` dilepas SEBELUM resume dihapus.
import { describe, it, expect, vi } from "vitest";
import { AUDIT_ACTION } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import {
  createPurgeService,
  kandidatWhere,
  PURGE_POLICY,
  TABEL_DIHAPUS,
} from "../src/modules/users/index.js";

const SEKARANG = new Date("2026-08-08T00:00:00.000Z");
const USER_A = "018f4c1e-0000-7000-8000-00000000aaaa";
const USER_B = "018f4c1e-0000-7000-8000-00000000bbbb";

interface OpsiFake {
  kandidat?: string[];
  /** Akun yang punya lamaran hired → jalur anonimisasi. */
  hired?: readonly string[];
  /** Jumlah baris anak per tabel per akun. */
  anakPerTabel?: number;
  /** Total kandidat di DB (untuk hasMore). */
  total?: number;
}

/**
 * Prisma palsu yang MENCATAT URUTAN panggilan. Urutan itu bagian dari
 * kebenarannya: melepas `resume_id` setelah menghapus resume akan menggagalkan
 * seluruh transaksi (FK `NoAction`, PR-011), dan kegagalan itu hanya muncul
 * pada akun yang pernah melamar — bukan pada test yang datanya bersih.
 */
function fakePrisma(opsi: OpsiFake = {}) {
  const kandidat = opsi.kandidat ?? [USER_A];
  const hired = new Set(opsi.hired ?? []);
  const anak = opsi.anakPerTabel ?? 2;
  const jejak: string[] = [];

  const delegateAnak = (nama: string) => ({
    count: () => {
      jejak.push(`count:${nama}`);
      return Promise.resolve(anak);
    },
    deleteMany: () => {
      jejak.push(`deleteMany:${nama}`);
      return Promise.resolve({ count: anak });
    },
  });

  const klien: Record<string, unknown> = {
    user: {
      findMany: () => Promise.resolve(kandidat.map((id) => ({ id }))),
      count: () => Promise.resolve(opsi.total ?? kandidat.length),
      delete: ({ where }: { where: { id: string } }) => {
        jejak.push(`delete:user:${where.id}`);
        return Promise.resolve({ id: where.id });
      },
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        jejak.push(`update:user:${where.id}`);
        return Promise.resolve({ id: where.id, ...data });
      },
    },
    application: {
      count: ({ where }: { where: { userId: string; status?: string } }) => {
        if (where.status === "hired") return Promise.resolve(hired.has(where.userId) ? 1 : 0);
        return Promise.resolve(3);
      },
      updateMany: () => {
        jejak.push("updateMany:application:resumeId");
        return Promise.resolve({ count: 1 });
      },
    },
  };
  for (const tabel of TABEL_DIHAPUS) klien[tabel] = delegateAnak(tabel);
  klien.$transaction = <T>(fn: (tx: unknown) => Promise<T>) => {
    jejak.push("transaksi:mulai");
    return fn(klien);
  };

  return { prisma: klien as unknown as AppPrisma, jejak };
}

function fakeAudit() {
  const entri: Array<{ action: string; entityId: string | null; meta: Record<string, unknown> }> = [];
  const auditLog = vi.fn((_a, action, _e, entityId, meta) => {
    entri.push({ action: action as string, entityId, meta: meta as Record<string, unknown> });
  });
  return { auditLog: auditLog as never, entri };
}

function rakit(opsi: OpsiFake = {}) {
  const { prisma, jejak } = fakePrisma(opsi);
  const audit = fakeAudit();
  const service = createPurgeService({ prisma, auditLog: audit.auditLog, clock: () => SEKARANG });
  return { service, audit, jejak };
}

describe("selector kandidat", () => {
  it("cutoff persis 30 hari sebelum sekarang", () => {
    const cutoff = new Date(SEKARANG.getTime() - PURGE_POLICY.hariTunggu * 86_400_000);
    const where = kandidatWhere(cutoff);

    expect(where.deletedAt).toEqual({ not: null, lt: cutoff });
    expect(cutoff.toISOString()).toBe("2026-07-09T00:00:00.000Z");
  });

  it("hanya menjaring baris yang MASIH memegang PII", () => {
    // Inilah penanda "belum dipurge" — keadaan, bukan kolom. Kalau salah satu
    // syarat OR ini hilang, baris yang sudah bersih akan terpilih berulang kali
    // setiap hari, selamanya.
    const where = kandidatWhere(new Date());

    expect(where.OR).toEqual([
      { phone: { not: null } },
      { email: { not: null } },
      { googleId: { not: null } },
      { fullName: { not: "" } },
    ]);
  });
});

describe("dry-run", () => {
  it("melaporkan dampak TANPA membuka transaksi atau menulis apa pun", async () => {
    const { service, jejak } = rakit({ hired: [USER_A] });

    const laporan = await service.run({ dryRun: true });

    expect(laporan).toMatchObject({ dryRun: true, accounts: 1, anonymized: 1, deleted: 0 });
    expect(laporan.records).toBe(TABEL_DIHAPUS.length * 2);
    // Tidak ada transaksi, tidak ada delete, tidak ada update.
    expect(jejak.filter((j) => j.startsWith("transaksi"))).toEqual([]);
    expect(jejak.some((j) => j.startsWith("delete") || j.startsWith("update"))).toBe(false);
  });

  it("menghitung lamaran yang ikut hilang pada jalur hapus-penuh", async () => {
    // Cascade membawa `applications` juga; laporan yang tidak menghitungnya
    // akan meremehkan dampak justru pada operasi yang paling destruktif.
    const { service } = rakit({ hired: [] });

    const laporan = await service.run({ dryRun: true });

    expect(laporan.deleted).toBe(1);
    expect(laporan.records).toBe(TABEL_DIHAPUS.length * 2 + 3);
  });

  it("default BUKAN dry-run — cron tanpa payload harus benar-benar menghapus", async () => {
    const { service, jejak } = rakit({ hired: [] });

    const laporan = await service.run();

    expect(laporan.dryRun).toBe(false);
    expect(jejak).toContain(`delete:user:${USER_A}`);
  });
});

describe("jalur hapus-penuh (tanpa lamaran hired)", () => {
  it("satu DELETE pada users; tidak menyentuh tabel anak satu per satu", async () => {
    // Cascade yang mengerjakannya. Menghapus manual di sini bukan hanya
    // mubazir — ia daftar yang harus diingat setiap kali tabel baru lahir.
    const { service, jejak } = rakit({ hired: [] });

    await service.run();

    expect(jejak).toContain(`delete:user:${USER_A}`);
    expect(jejak.filter((j) => j.startsWith("deleteMany:"))).toEqual([]);
  });
});

describe("jalur anonimisasi (punya lamaran hired)", () => {
  it("melepas resume_id SEBELUM menghapus resumes", async () => {
    // FK `applications.resume_id` ber-onDelete NoAction (PR-011, disengaja).
    // Urutan terbalik menggagalkan SELURUH transaksi untuk setiap akun yang
    // pernah melamar — dan hanya untuk mereka, sehingga mudah lolos test.
    const { service, jejak } = rakit({ hired: [USER_A] });

    await service.run();

    const lepas = jejak.indexOf("updateMany:application:resumeId");
    const hapusResume = jejak.indexOf("deleteMany:resume");
    expect(lepas).toBeGreaterThanOrEqual(0);
    expect(hapusResume).toBeGreaterThan(lepas);
  });

  it("menghapus SELURUH tabel di TABEL_DIHAPUS, lalu mengosongkan PII", async () => {
    const { service, jejak } = rakit({ hired: [USER_A] });

    await service.run();

    for (const tabel of TABEL_DIHAPUS) {
      expect(jejak, `tabel ${tabel} tidak dihapus`).toContain(`deleteMany:${tabel}`);
    }
    expect(jejak).toContain(`update:user:${USER_A}`);
    expect(jejak).not.toContain(`delete:user:${USER_A}`);
  });

  it("seluruh pekerjaan satu akun berada di dalam satu transaksi", async () => {
    const { service, jejak } = rakit({ hired: [USER_A] });

    await service.run();

    // Penghapusan separuh jalan pada operasi destruktif adalah bentuk kegagalan
    // paling buruk: data hilang, tetapi barisnya masih terpilih besok.
    expect(jejak[0]).toBe("transaksi:mulai");
    expect(jejak.filter((j) => j === "transaksi:mulai")).toHaveLength(1);
  });
});

describe("audit run", () => {
  it("satu baris per akun plus satu ringkasan run", async () => {
    const { service, audit } = rakit({ kandidat: [USER_A, USER_B], hired: [USER_B] });

    await service.run();

    expect(audit.entri).toHaveLength(3);
    expect(audit.entri.every((e) => e.action === AUDIT_ACTION.DATA_PURGED)).toBe(true);
    expect(audit.entri.map((e) => e.entityId)).toEqual([USER_A, USER_B, null]);
    // Ringkasan menjumlahkan kedua jalur.
    expect(audit.entri[2]?.meta).toMatchObject({ accounts: 2, deleted: 1, anonymized: 1 });
  });

  it("ringkasan tetap ditulis meski tidak ada kandidat", async () => {
    // "Job berjalan dan tidak menemukan apa-apa" dan "job tidak berjalan sama
    // sekali" harus bisa dibedakan setelahnya.
    const { service, audit } = rakit({ kandidat: [], total: 0 });

    const laporan = await service.run();

    expect(laporan.accounts).toBe(0);
    expect(audit.entri).toHaveLength(1);
    expect(audit.entri[0]?.entityId).toBeNull();
  });

  it("dry-run tetap tercatat, dan penandanya ikut", async () => {
    const { service, audit } = rakit({ hired: [USER_A] });

    await service.run({ dryRun: true });

    expect(audit.entri.every((e) => e.meta.dryRun === true)).toBe(true);
  });

  it("audit tidak memuat PII — hanya id akun dan angka", async () => {
    const { service, audit } = rakit({ hired: [USER_A] });

    await service.run();

    for (const entri of audit.entri) {
      expect(Object.keys(entri.meta).sort()).toEqual([
        "accounts",
        "anonymized",
        "deleted",
        "dryRun",
        "records",
      ]);
    }
  });
});

describe("batas per run", () => {
  it("melaporkan hasMore saat masih ada kandidat tersisa", async () => {
    // Backlog yang tidak pernah habis berarti janji 30 hari mulai meleset —
    // dan tanpa penanda ini, tidak ada apa pun yang memberitahu.
    const { service } = rakit({ kandidat: [USER_A], total: 900 });

    const laporan = await service.run({ dryRun: true });

    expect(laporan.hasMore).toBe(true);
  });

  it("hasMore false saat semua kandidat termuat", async () => {
    const { service } = rakit({ kandidat: [USER_A], total: 1 });

    expect((await service.run({ dryRun: true })).hasMore).toBe(false);
  });
});
