// modules/applications — baris DB → kontrak lamaran (PR-076, dipakai bersama
// jalur admin sejak PR-077a). Satu pemeta untuk pelamar dan admin, supaya
// "riwayat yang dibaca admin" dan "riwayat yang dibaca pelamar" tidak bisa
// menyimpang diam-diam.
import { z } from "zod";
import {
  applicationStatusHistoryEntrySchema,
  type ApplicationStatusHistoryEntry,
  type MyApplication,
} from "@nawasena/schemas";
import type { Logger } from "../../../core/logger/index.js";
import type { ApplicationDetailRow } from "../repositories/applications.repository.js";

const riwayatSchema = z.array(applicationStatusHistoryEntrySchema);

export interface RingkasanLowongan {
  id: string;
  title: string;
  companyName: string;
  aktif: boolean;
}

export function createPemetaLamaran(deps: {
  /** `jobsService.ringkasanUntukLamaran` — termasuk lowongan yang sudah tutup. */
  ringkasanLowongan(ids: readonly string[]): Promise<RingkasanLowongan[]>;
  logger: Pick<Logger, "error">;
}) {
  /**
   * JSONB → riwayat. Isi yang rusak tidak menjatuhkan halaman: dicatat `error`
   * (itu bug penulis, bukan input pengguna) lalu dibaca kosong — statusnya
   * sendiri tetap benar di kolom `status`.
   */
  function keRiwayat(row: ApplicationDetailRow): ApplicationStatusHistoryEntry[] {
    const hasil = riwayatSchema.safeParse(row.statusHistory);
    if (hasil.success) return hasil.data;
    deps.logger.error({ applicationId: row.id }, "status_history lamaran tidak sesuai bentuk");
    return [];
  }

  async function keLamaran(rows: readonly ApplicationDetailRow[]): Promise<MyApplication[]> {
    const lowongan = new Map(
      (await deps.ringkasanLowongan([...new Set(rows.map((r) => r.jobId))])).map((j) => [j.id, j]),
    );
    return rows.map((row) => {
      const job = lowongan.get(row.jobId);
      return {
        id: row.id,
        jobId: row.jobId,
        resumeId: row.resumeId,
        discloseDisability: row.discloseDisability,
        status: row.status,
        appliedAt: row.appliedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        hiredConfirmedAt: row.hiredConfirmedAt?.toISOString() ?? null,
        job:
          job === undefined
            ? null
            : { title: job.title, companyName: job.companyName, aktif: job.aktif },
      };
    });
  }

  return { keRiwayat, keLamaran };
}

export type PemetaLamaran = ReturnType<typeof createPemetaLamaran>;
