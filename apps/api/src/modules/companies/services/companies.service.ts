// modules/companies — service (PR-051, SDD §6.2, PRD FR-6.1).
//
// Perusahaan bukan milik satu pengguna — dikurasi admin, dan profilnya publik
// dengan sengaja (USP "Company Accessibility Profile"). Karena itu bentuk
// service ini beda dari `profiles.service.ts`: yang dijaga di sini bukan
// kepemilikan, melainkan JALUR menuju status "verified" (lihat komentar
// `editableInclusivityStatusSchema` di @nawasena/schemas/companies).
import {
  AUDIT_ACTION,
  type CompanyAdmin,
  type CompanyPublic,
  type CreateCompany,
  type InclusivityStatus,
  type UpdateCompany,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { EventBus } from "../../../core/events/index.js";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import type {
  CompaniesRepository,
  CompanyRow,
  CompanyUpdatePatch,
} from "../repositories/companies.repository.js";

/** Entitas audit modul ini. */
export const AUDIT_ENTITY = "companies.company";

/** Konteks admin pemanggil — bentuknya sama dengan actor modul lain. */
export interface CompaniesActor {
  userId: string;
  requestId: string;
}

export interface CompaniesServiceDeps {
  companiesRepository: CompaniesRepository;
  auditLog: AuditLog;
  /** Penerbit `company.verified` (PR-051); belum ada pelanggan (core/events). */
  events: EventBus;
  clock?: () => Date;
}

/**
 * `inclusivityStatus` DB (snake_case) → nilai yang dikontrak
 * `auditMetaSchemas[COMPANY_VERIFIED]` (camelCase, ditulis PR-014 sebelum
 * modul ini ada). Satu-satunya tempat kedua bentuk bertemu — lihat komentar
 * `inclusivityStatusSchema` di @nawasena/schemas/companies untuk alasan
 * keduanya TIDAK diseragamkan.
 */
function keStatusAudit(status: InclusivityStatus): "unverified" | "selfClaimed" | "verified" {
  return status === "self_claimed" ? "selfClaimed" : status;
}

function keTimestamp(waktu: Date | null): string | null {
  return waktu === null ? null : waktu.toISOString();
}

function keProfilPublik(row: CompanyRow): CompanyPublic {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    website: row.website,
    city: row.city,
    inclusivityStatus: row.inclusivityStatus,
    accommodationsAvailable: row.accommodationsAvailable,
    verifiedAt: keTimestamp(row.verifiedAt),
  };
}

function keProfilAdmin(row: CompanyRow): CompanyAdmin {
  return {
    ...keProfilPublik(row),
    verifiedBy: row.verifiedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createCompaniesService(deps: CompaniesServiceDeps) {
  const { companiesRepository, auditLog, events } = deps;
  const now = deps.clock ?? (() => new Date());

  const catatPerubahan = (actor: CompaniesActor, id: string, operation: "create" | "update") =>
    auditLog(
      { actorId: actor.userId, requestId: actor.requestId },
      AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
      AUDIT_ENTITY,
      id,
      { operation },
    );

  return {
    /** GET /api/v1/companies/:id — profil publik, dilihat sebelum melamar. */
    async getPublic(id: string): Promise<CompanyPublic> {
      const row = await companiesRepository.findById(id);
      if (row === null) throw appError("PERUSAHAAN_TIDAK_DITEMUKAN");
      return keProfilPublik(row);
    },

    /** GET /api/v1/admin/companies — seluruh perusahaan, tanpa pagination (skala pilot). */
    async listAdmin(): Promise<CompanyAdmin[]> {
      const rows = await companiesRepository.listAll();
      return rows.map(keProfilAdmin);
    },

    /** POST /api/v1/admin/companies — status verifikasi selalu lahir `unverified`. */
    async create(actor: CompaniesActor, input: CreateCompany): Promise<CompanyAdmin> {
      const id = uuidV7();
      const row = await companiesRepository.create(id, {
        name: input.name,
        description: input.description,
        website: input.website,
        city: input.city,
        accommodationsAvailable: input.accommodationsAvailable,
      });
      catatPerubahan(actor, id, "create");
      return keProfilAdmin(row);
    },

    /**
     * PUT /api/v1/admin/companies/:id — patch sebagian, termasuk koreksi
     * status turun (`verified` → `unverified`/`self_claimed`). Naik menuju
     * `verified` TIDAK bisa lewat sini — `editableInclusivityStatusSchema`
     * sudah menolaknya sebelum permintaan sampai ke service ini.
     */
    async update(actor: CompaniesActor, id: string, input: UpdateCompany): Promise<CompanyAdmin> {
      const patch: CompanyUpdatePatch = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.website !== undefined) patch.website = input.website;
      if (input.city !== undefined) patch.city = input.city;
      if (input.accommodationsAvailable !== undefined) {
        patch.accommodationsAvailable = input.accommodationsAvailable;
      }
      if (input.inclusivityStatus !== undefined) patch.inclusivityStatus = input.inclusivityStatus;

      const row = await companiesRepository.update(id, patch);
      if (row === null) throw appError("PERUSAHAAN_TIDAK_DITEMUKAN");
      catatPerubahan(actor, id, "update");
      return keProfilAdmin(row);
    },

    /**
     * POST /api/v1/admin/companies/:id/verify — satu-satunya jalan menuju
     * `inclusivityStatus: "verified"`. Boleh dipanggil pada perusahaan yang
     * SUDAH verified (re-verifikasi setelah koreksi data) — `from` pada baris
     * audit itu akan bernilai "verified" pula, dan itu representasi yang sah.
     */
    async verify(actor: CompaniesActor, id: string): Promise<CompanyAdmin> {
      const sebelum = await companiesRepository.findById(id);
      if (sebelum === null) throw appError("PERUSAHAAN_TIDAK_DITEMUKAN");

      const waktu = now();
      const row = await companiesRepository.verify(id, actor.userId, waktu);
      if (row === null) throw appError("PERUSAHAAN_TIDAK_DITEMUKAN");

      auditLog(
        { actorId: actor.userId, requestId: actor.requestId },
        AUDIT_ACTION.COMPANY_VERIFIED,
        AUDIT_ENTITY,
        id,
        { from: keStatusAudit(sebelum.inclusivityStatus), to: "verified" },
      );
      events.emit("company.verified", {
        companyId: id,
        verifiedBy: actor.userId,
        verifiedAt: waktu.toISOString(),
      });

      return keProfilAdmin(row);
    },
  };
}

export type CompaniesService = ReturnType<typeof createCompaniesService>;
