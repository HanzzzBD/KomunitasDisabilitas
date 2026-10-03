// modules/users — moderasi akun oleh admin (PR-083, FR-6.2).
//
// URUTAN TANGGUHKAN: (1) tulis `suspended_at` — penjaga sesi & refresh menolak
// SEKETIKA (`findActiveSessionUser` menyaringnya); (2) cabut semua sesi (`ver`
// naik + refresh dicabut) supaya pemulihan kelak berarti masuk ulang, bukan
// sesi lama yang hidup lagi; (3) audit ber-alasan.
//
// Keputusan owner 2026-10-03: hanya PENCARI KERJA yang bisa ditangguhkan;
// admin tidak bisa menangguhkan dirinya sendiri; alasan wajib dan internal.
import {
  AUDIT_ACTION,
  type AdminUser,
  type AdminUserListQuery,
  type AdminUserListResponse,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import { appError } from "../../../core/http/index.js";
import { decodeKursor, encodeKursor } from "../../../core/pagination/index.js";
import type { AdminUserRow, ModerationRepository } from "../repositories/moderation.repository.js";

export interface ModerationActor {
  userId: string;
  requestId: string;
}

export interface ModerationServiceDeps {
  repo: ModerationRepository;
  auditLog: AuditLog;
  /** `createSessionRevoker` modul auth (composition root). */
  cabutSemuaSesi(userId: string): Promise<void>;
  clock?: () => Date;
}

function keKontrak(r: AdminUserRow): AdminUser {
  return {
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    email: r.email,
    role: r.role,
    createdAt: r.createdAt.toISOString(),
    suspendedAt: r.suspendedAt?.toISOString() ?? null,
    suspendReason: r.suspendReason,
  };
}

export function createModerationService(deps: ModerationServiceDeps) {
  const now = deps.clock ?? (() => new Date());

  /** Sebab kegagalan CAS: tidak ada / bukan seeker / sudah dalam status itu. */
  async function sebabGagal(id: string): Promise<never> {
    const row = await deps.repo.findActive(id);
    if (row === null) throw appError("PENGGUNA_TIDAK_DITEMUKAN");
    if (row.role !== "seeker") throw appError("PENGGUNA_TIDAK_BISA_DIMODERASI");
    throw appError("STATUS_PENGGUNA_TIDAK_BERUBAH");
  }

  return {
    /** GET /admin/users. */
    async list(query: AdminUserListQuery): Promise<AdminUserListResponse> {
      const posisi = query.cursor === undefined ? undefined : decodeKursor(query.cursor);
      const rows = await deps.repo.list(
        { q: query.q, status: query.status },
        query.limit + 1,
        posisi === undefined ? undefined : { createdAt: posisi.sortAt, id: posisi.id },
      );
      const adaLagi = rows.length > query.limit;
      const halaman = adaLagi ? rows.slice(0, query.limit) : rows;
      const terakhir = halaman.at(-1);
      return {
        data: halaman.map(keKontrak),
        meta: {
          nextCursor:
            adaLagi && terakhir !== undefined
              ? encodeKursor({ sortAt: terakhir.createdAt, id: terakhir.id })
              : null,
        },
      };
    },

    /** POST /admin/users/:id/suspend. */
    async suspend(actor: ModerationActor, id: string, reason: string): Promise<AdminUser> {
      if (id === actor.userId) throw appError("PENGGUNA_TIDAK_BISA_DIMODERASI");
      const row = await deps.repo.suspend(id, reason, now());
      if (row === null) return sebabGagal(id);
      await deps.cabutSemuaSesi(id);
      deps.auditLog(
        { actorId: actor.userId, requestId: actor.requestId },
        AUDIT_ACTION.USER_SUSPENDED,
        "users",
        id,
        { reason },
      );
      return keKontrak(row);
    },

    /** POST /admin/users/:id/unsuspend — akses pulih; sesi lama TIDAK hidup lagi. */
    async unsuspend(actor: ModerationActor, id: string, reason: string): Promise<AdminUser> {
      const row = await deps.repo.unsuspend(id);
      if (row === null) return sebabGagal(id);
      deps.auditLog(
        { actorId: actor.userId, requestId: actor.requestId },
        AUDIT_ACTION.USER_UNSUSPENDED,
        "users",
        id,
        { reason },
      );
      return keKontrak(row);
    },
  };
}

export type ModerationService = ReturnType<typeof createModerationService>;
