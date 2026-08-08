// modules/jobs — penutupan otomatis lowongan kedaluwarsa (PR-024b, SDD §6.4).
//
// Modul `jobs` lahir di sini dengan LAPISAN SERVICE SAJA. Router, controller,
// dan repository-nya menyusul di Phase 08 bersama endpoint lowongan. Ia ada di
// daftar 13 modul resmi (CLAUDE.md §3.2), jadi ini bukan modul karangan —
// hanya modul yang belum lengkap. Alternatifnya, menaruh logika lowongan di
// modul `users` atau di worker, jauh lebih buruk: yang pertama salah pemilik,
// yang kedua menaruh aturan bisnis di entry point yang tidak punya batas modul.
import { AUDIT_ACTION, type JobClosedEvent } from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { AppPrisma } from "../../../core/db/index.js";
import type { EventBus } from "../../../core/events/index.js";
import { uuidV7 } from "../../../core/ids/index.js";

/** Entitas audit modul ini. */
const AUDIT_ENTITY = "jobs.expiry";

export interface JobExpiryReport {
  dryRun: boolean;
  /** Lowongan yang benar-benar berpindah ke `closed` pada run ini. */
  closed: number;
  /** Masih kedaluwarsa setelah run — sisa di luar batas. */
  remaining: number;
}

export interface JobExpiryLimits {
  batchSize: number;
  maxPerRun: number;
}

export interface JobExpiryServiceDeps {
  prisma: AppPrisma;
  events: EventBus;
  auditLog: AuditLog;
  limits: JobExpiryLimits;
  clock?: () => Date;
}

export function createJobExpiryService(deps: JobExpiryServiceDeps) {
  const { prisma, events, auditLog, limits } = deps;
  const now = deps.clock ?? (() => new Date());

  /**
   * Hanya `published` yang tersentuh.
   *
   * `draft` yang kedaluwarsa DIBIARKAN: ia belum pernah terbit, jadi menutupnya
   * berarti mengarang transisi status yang tidak pernah terjadi — dan riwayat
   * status adalah hal yang dibaca orang saat menyelidiki, bukan sekadar kolom.
   * `closed` juga dilewati: ia sudah di tujuan.
   */
  const syarat = (saatIni: Date) => ({
    status: "published" as const,
    expiresAt: { not: null, lt: saatIni },
  });

  return {
    async run(options: { dryRun?: boolean } = {}): Promise<JobExpiryReport> {
      const dryRun = options.dryRun ?? false;
      const saatIni = now();

      const closed = dryRun ? 0 : await tutupBerbatch(saatIni);
      // Dihitung SETELAH penutupan: inilah sisa yang sesungguhnya.
      const remaining = await prisma.job.count({ where: syarat(saatIni) });

      auditLog(
        { actorId: null, requestId: uuidV7() },
        AUDIT_ACTION.JOB_AUTO_CLOSED,
        AUDIT_ENTITY,
        null,
        { dryRun, closed, remaining },
      );

      return { dryRun, closed, remaining };
    },
  };

  /**
   * `UPDATE … RETURNING id` — satu statement per batch, dan hasilnya adalah
   * daftar lowongan yang BENAR-BENAR tertutup oleh statement ini.
   *
   * Itu yang membuat event-nya jujur. `updateMany` hanya mengembalikan jumlah,
   * jadi menerbitkan event dari daftar id yang dipilih SEBELUM update berarti
   * mengumumkan penutupan yang mungkin dilakukan orang lain — atau tidak
   * dilakukan sama sekali.
   *
   * `updated_at` disetel manual: `@updatedAt` Prisma tidak berlaku pada raw SQL.
   */
  async function tutupBerbatch(saatIni: Date): Promise<number> {
    let total = 0;

    while (total < limits.maxPerRun) {
      const batas = Math.min(limits.batchSize, limits.maxPerRun - total);
      const tertutup = await prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "jobs" SET "status" = 'closed', "updated_at" = ${saatIni}
        WHERE "id" IN (
          SELECT "id" FROM "jobs"
          WHERE "status" = 'published'
            AND "expires_at" IS NOT NULL AND "expires_at" < ${saatIni}
          LIMIT ${batas}
        )
        RETURNING "id"`;

      for (const { id } of tertutup) {
        const payload: JobClosedEvent = {
          jobId: id,
          closedAt: saatIni.toISOString(),
          reason: "expired",
        };
        // Diterbitkan SETELAH baris benar-benar berubah, dan kegagalan
        // pelanggan tidak pernah membatalkannya (lihat core/events).
        events.emit("job.closed", payload);
      }

      total += tertutup.length;
      if (tertutup.length < batas) break;
    }

    return total;
  }
}

export type JobExpiryService = ReturnType<typeof createJobExpiryService>;
