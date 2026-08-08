// modules/users — mesin retensi data (PR-024a, SDD §6.4).
//
// Berbeda dari purge (PR-023) yang berpusat pada AKUN, retensi berpusat pada
// UMUR BARIS: setiap tabel punya ambangnya sendiri, dan ambang itu adalah
// keputusan produk/keamanan, bukan setelan storage.
//
// Bentuknya registry dengan alasan yang sama seperti ekspor (PR-022): kebijakan
// dimiliki modul yang memiliki tabelnya. `refresh_tokens` hidup di modul auth
// karena ambangnya adalah jendela deteksi reuse — pengetahuan yang harus duduk
// di sebelah kode yang bergantung padanya, bukan di berkas maintenance.
//
// YANG DILAKUKAN MESIN INI DAN TIDAK BOLEH DILAKUKAN KEBIJAKAN: pembatasan
// batch, batas per run, dry-run, audit, dan pelaporan sisa. Kebijakan hanya
// menjawab dua pertanyaan — berapa yang memenuhi syarat, dan hapus sebanyak
// ini. Semua kebijakan karena itu tunduk pada pengaman yang sama, dan tidak ada
// kebijakan yang bisa lupa memasangnya.
import { AUDIT_ACTION, type RetentionReport } from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { AppPrisma } from "../../../core/db/index.js";
import { uuidV7 } from "../../../core/ids/index.js";

/** Entitas audit job ini (tanpa PII). */
const AUDIT_ENTITY = "retention";

/**
 * Satu kebijakan retensi. Diimplementasikan modul pemilik tabelnya.
 *
 * `hitung` dipanggil SETELAH penghapusan untuk melaporkan sisa — angka yang
 * benar-benar berguna saat menyelidiki. Tabel yang bertambah lebih cepat
 * daripada yang dibersihkan tidak terlihat sama sekali dari `deleted` saja.
 */
export interface RetentionPolicy {
  /** Nama untuk audit & metrik, mis. `refresh_tokens.reuse`. Bukan PII. */
  readonly nama: string;
  hitung(now: Date): Promise<number>;
  /** Hapus paling banyak `batas` baris; kembalikan jumlah yang benar-benar terhapus. */
  hapus(now: Date, batas: number): Promise<number>;
}

export interface RetentionLimits {
  /** Baris per DELETE. */
  batchSize: number;
  /** Batas per kebijakan per run; sisanya diambil run berikutnya. */
  maxPerRun: number;
}

export interface RetentionServiceDeps {
  prisma: AppPrisma;
  /** Kebijakan dari modul lain (mis. `refresh_tokens` milik auth). */
  policies: readonly RetentionPolicy[];
  limits: RetentionLimits;
  auditLog: AuditLog;
  clock?: () => Date;
}

function cutoff(now: Date, hari: number): Date {
  return new Date(now.getTime() - hari * 86_400_000);
}

/**
 * Kebijakan untuk tabel yang MODULNYA BELUM LAHIR.
 *
 * `match_scores` akan menjadi milik modul matching (Phase 11) dan `ai_usage`
 * milik modul AI (Phase 06). Sampai saat itu keduanya menumpang di sini —
 * dicatat eksplisit supaya pemindahannya kelak menjadi langkah yang disengaja,
 * bukan penemuan tak terduga.
 */
export function createOrphanPolicies(deps: {
  prisma: AppPrisma;
  matchScoresDays: number;
  aiUsageDays: number;
}): RetentionPolicy[] {
  const { prisma, matchScoresDays, aiUsageDays } = deps;

  return [
    {
      // Cache turunan: selalu bisa dihitung ulang, jadi menghapusnya tidak
      // menghilangkan apa pun yang tidak bisa dikembalikan (SDD §6.2).
      nama: "match_scores",
      hitung: (now) =>
        prisma.matchScore.count({ where: { computedAt: { lt: cutoff(now, matchScoresDays) } } }),
      hapus: (now, batas) =>
        // PK-nya komposit (user_id, job_id) — subquery memakai keduanya.
        prisma.$executeRaw`
          DELETE FROM "match_scores" WHERE ("user_id", "job_id") IN (
            SELECT "user_id", "job_id" FROM "match_scores"
            WHERE "computed_at" < ${cutoff(now, matchScoresDays)}
            LIMIT ${batas}
          )`,
    },
    {
      // Agregat bulanannya sudah difinalkan sebelum langkah ini (lihat
      // `finalkanBulanAiUsage`), jadi yang hilang di sini hanya rinciannya.
      nama: "ai_usage",
      hitung: (now) =>
        prisma.aiUsage.count({ where: { createdAt: { lt: cutoff(now, aiUsageDays) } } }),
      hapus: (now, batas) =>
        prisma.$executeRaw`
          DELETE FROM "ai_usage" WHERE "id" IN (
            SELECT "id" FROM "ai_usage"
            WHERE "created_at" < ${cutoff(now, aiUsageDays)}
            LIMIT ${batas}
          )`,
    },
  ];
}

export function createRetentionService(deps: RetentionServiceDeps) {
  const { prisma, policies, limits, auditLog } = deps;
  const now = deps.clock ?? (() => new Date());

  /** requestId sintetis: job tidak punya permintaan HTTP, tetapi audit menuntutnya. */
  const aktorSistem = () => ({ actorId: null, requestId: uuidV7() });

  /**
   * Finalkan bulan `ai_usage` yang SUDAH SELESAI dan belum punya agregat.
   *
   * Sekali saja, tidak pernah dihitung ulang. Menghitung ulang bulan yang
   * sebagian barisnya sudah terhapus akan membuat agregat MENYUSUT diam-diam
   * setiap hari — kesalahan yang tidak menimbulkan error dan hanya terlihat
   * bertahun kemudian sebagai grafik yang salah.
   *
   * Aman terhadap penghapusan di bawah: bulan selesai difinalkan ~1 hari
   * setelah berakhir, sementara barisnya baru dihapus pada umur 90 hari.
   */
  async function finalkanBulanAiUsage(saatIni: Date): Promise<number> {
    const bulan = await prisma.$queryRaw<Array<{ month: Date }>>`
      SELECT DISTINCT date_trunc('month', "created_at")::date AS month
      FROM "ai_usage"
      WHERE "created_at" < date_trunc('month', ${saatIni}::timestamptz)
        AND date_trunc('month', "created_at")::date NOT IN (
          SELECT "month" FROM "ai_usage_monthly"
        )`;
    if (bulan.length === 0) return 0;

    await prisma.$executeRaw`
      INSERT INTO "ai_usage_monthly" ("month", "feature", "provider", "requests", "tokens_in", "tokens_out")
      SELECT date_trunc('month', "created_at")::date, "feature", "provider",
             COUNT(*), COALESCE(SUM("tokens_in"), 0), COALESCE(SUM("tokens_out"), 0)
      FROM "ai_usage"
      WHERE "created_at" < date_trunc('month', ${saatIni}::timestamptz)
        AND date_trunc('month', "created_at")::date NOT IN (
          SELECT "month" FROM "ai_usage_monthly"
        )
      GROUP BY 1, 2, 3
      ON CONFLICT DO NOTHING`;

    return bulan.length;
  }

  /** Hapus berbatch sampai habis, batas run, atau batch kosong. */
  async function hapusBerbatch(policy: RetentionPolicy, saatIni: Date): Promise<number> {
    let total = 0;
    while (total < limits.maxPerRun) {
      const batas = Math.min(limits.batchSize, limits.maxPerRun - total);
      const terhapus = await policy.hapus(saatIni, batas);
      total += terhapus;
      // Batch yang tidak penuh berarti kandidatnya habis — berhenti tanpa
      // menembak satu query kosong lagi.
      if (terhapus < batas) break;
    }
    return total;
  }

  return {
    async run(options: { dryRun?: boolean } = {}): Promise<RetentionReport> {
      const dryRun = options.dryRun ?? false;
      const saatIni = now();

      // Agregasi SELALU lebih dulu, dan tidak dilewati saat dry-run hanya
      // karena "dry-run tidak boleh menulis": ia bukan penghapusan, dan
      // menundanya berarti dry-run melaporkan keadaan yang berbeda dari yang
      // akan terjadi. Yang ditunda saat dry-run hanyalah DELETE.
      const monthsAggregated = dryRun ? 0 : await finalkanBulanAiUsage(saatIni);

      const hasil: RetentionReport["policies"] = [];
      for (const policy of policies) {
        const deleted = dryRun ? 0 : await hapusBerbatch(policy, saatIni);
        // Dihitung SETELAH penghapusan: inilah sisa yang sesungguhnya.
        const remaining = await policy.hitung(saatIni);
        hasil.push({ policy: policy.nama, deleted, remaining });

        auditLog(aktorSistem(), AUDIT_ACTION.DATA_RETAINED, AUDIT_ENTITY, null, {
          dryRun,
          policy: policy.nama,
          deleted,
          remaining,
        });
      }

      const laporan: RetentionReport = {
        dryRun,
        monthsAggregated,
        policies: hasil,
        deleted: hasil.reduce((n, p) => n + p.deleted, 0),
        remaining: hasil.reduce((n, p) => n + p.remaining, 0),
      };

      // Ringkasan run — ditulis bahkan saat nol baris tersentuh: "job berjalan
      // dan tidak menemukan apa-apa" dan "job tidak berjalan sama sekali"
      // adalah dua keadaan yang sangat berbeda.
      auditLog(aktorSistem(), AUDIT_ACTION.DATA_RETAINED, AUDIT_ENTITY, null, {
        dryRun,
        policy: "run",
        deleted: laporan.deleted,
        remaining: laporan.remaining,
        monthsAggregated,
      });

      return laporan;
    },
  };
}

export type RetentionService = ReturnType<typeof createRetentionService>;
