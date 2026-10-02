// modules/jobs — service (PR-055, SDD §6.2, PRD FR-4.1).
//
// STATE MACHINE KETAT, TANPA JALAN MUNDUR: draft → published → closed. Beda
// dari `companies.service.ts` (yang mengizinkan koreksi turun dari `verified`
// lewat PUT), lowongan TIDAK punya jalur koreksi — AC PR-055 eksplisit
// "Transisi status ilegal ditolak", dan tidak ada AC yang meminta pengecualian
// apa pun. `publish()` hanya menerima dari `draft`; `close()` hanya menerima
// dari `published`. Keduanya menolak selain itu, termasuk memanggil ulang aksi
// yang sama (publish yang sudah published, close yang sudah closed) —
// idempotensi seperti `verify()` company SENGAJA tidak ditiru di sini.
import {
  AUDIT_ACTION,
  type AccommodationNeed,
  type CreateJob,
  type JobAdmin,
  type JobPublic,
  type JobPublicSummary,
  type JobSearchQuery,
  type JobSearchResponse,
  type JobSearchResult,
  type UpdateJob,
  type WorkMode,
} from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import type { EventBus } from "../../../core/events/index.js";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import { decodeKursor, encodeKursor } from "../../../core/pagination/index.js";
import type {
  JobRow,
  JobSearchRow,
  JobUpdatePatch,
  JobsRepository,
} from "../repositories/jobs.repository.js";

/** Entitas audit modul ini. */
export const AUDIT_ENTITY = "jobs.job";

/** Konteks admin pemanggil — bentuknya sama dengan actor modul lain. */
export interface JobsActor {
  userId: string;
  requestId: string;
}

/**
 * Bahan embedding satu lowongan (PR-069) — dibaca modul `matching` lewat
 * service ini, bukan lewat repository-nya (ADR-001).
 *
 * SEMPIT DENGAN SENGAJA: hanya teks yang bermakna semantik plus `createdBy`
 * (atribusi kuota AI, keputusan owner 2026-09-30). Akomodasi, ragam disabilitas
 * yang disambut, lokasi, dan mode kerja TIDAK ada di sini — semuanya dinilai
 * sebagai data terstruktur (filter PR-070, skor PR-071), dan memasukkannya ke
 * vektor berarti menghitungnya dua kali.
 */
export interface JobUntukEmbedding {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  createdBy: string | null;
}

/**
 * Bahan prompt re-rank (PR-072). SENGAJA tanpa `welcomedDisabilityTypes`:
 * lowongan yang "menyambut Tuli" di prompt membuat model menulis "cocok untuk
 * Anda yang Tuli" — penjelasan yang menyebut kondisi pengguna (dilarang,
 * PR-073).
 */
export interface JobUntukRerank {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  workMode: WorkMode;
  city: string | null;
  province: string | null;
  accommodations: AccommodationNeed[];
}

/**
 * Kartu feed matching (PR-073): kartu publik yang SAMA dengan hasil pencarian
 * (satu komponen kartu di FE) + teks untuk mencocokkan nama keahlian pada
 * penjelasan template. Tidak ada `welcomedDisabilityTypes` — alasan sama
 * dengan `JobUntukRerank`.
 */
export interface JobUntukFeed {
  kartu: JobSearchResult;
  requirements: string | null;
  description: string;
}

export interface JobsServiceDeps {
  jobsRepository: JobsRepository;
  auditLog: AuditLog;
  /** Penerbit `job.published`, `job.updated` (PR-069), dan `job.closed` (reason `closed_by_admin`). */
  events: EventBus;
  clock?: () => Date;
}

function keTimestamp(waktu: Date | null): string | null {
  return waktu === null ? null : waktu.toISOString();
}

function keRingkasan(row: JobRow): JobPublicSummary {
  return {
    id: row.id,
    title: row.title,
    employmentType: row.employmentType,
    workMode: row.workMode,
    city: row.city,
    province: row.province,
    publishedAt: keTimestamp(row.publishedAt),
  };
}

/**
 * `salaryMin`/`salaryMax` disembunyikan bila `salaryVisible` false — preferensi
 * tampilan perusahaan, ditegakkan di SINI (satu-satunya jalur publik), bukan
 * dipercayakan ke klien.
 */
function keProfilPublik(row: JobRow): JobPublic {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    requirements: row.requirements,
    employmentType: row.employmentType,
    workMode: row.workMode,
    city: row.city,
    province: row.province,
    salaryMin: row.salaryVisible ? row.salaryMin : null,
    salaryMax: row.salaryVisible ? row.salaryMax : null,
    accommodations: row.accommodations,
    welcomedDisabilityTypes: row.welcomedDisabilityTypes,
    publishedAt: keTimestamp(row.publishedAt),
    expiresAt: keTimestamp(row.expiresAt),
  };
}

function keProfilAdmin(row: JobRow): JobAdmin {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    requirements: row.requirements,
    employmentType: row.employmentType,
    workMode: row.workMode,
    city: row.city,
    province: row.province,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryVisible: row.salaryVisible,
    accommodations: row.accommodations,
    welcomedDisabilityTypes: row.welcomedDisabilityTypes,
    source: row.source,
    status: row.status,
    createdBy: row.createdBy,
    publishedAt: keTimestamp(row.publishedAt),
    expiresAt: keTimestamp(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function keHasilPencarian(row: JobSearchRow): JobSearchResult {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.companyName,
    title: row.title,
    employmentType: row.employmentType,
    workMode: row.workMode,
    city: row.city,
    province: row.province,
    accommodations: row.accommodations,
    publishedAt: row.publishedAt.toISOString(),
  };
}

/** `published` DAN belum lewat `expiresAt` (atau tanpa tenggat) — definisi "aktif" yang sama di seluruh modul ini. */
function masihAktif(row: JobRow, saatIni: Date): boolean {
  return row.status === "published" && (row.expiresAt === null || row.expiresAt > saatIni);
}

export function createJobsService(deps: JobsServiceDeps) {
  const { jobsRepository, auditLog, events } = deps;
  const now = deps.clock ?? (() => new Date());

  const catatPerubahan = (
    actor: JobsActor,
    id: string,
    operation: "create" | "update" | "publish" | "close" | "delete",
  ) =>
    auditLog(
      { actorId: actor.userId, requestId: actor.requestId },
      AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
      AUDIT_ENTITY,
      id,
      { operation },
    );

  return {
    /**
     * GET /api/v1/jobs/:id — lowongan `published` yang belum lewat
     * `expiresAt`. Draft, closed, dan yang sudah lewat tenggat SEMUANYA 404
     * `LOWONGAN_TIDAK_DITEMUKAN` — kandidat tidak pernah tahu bedanya "belum
     * pernah ada", "sudah ditutup", dan "sudah lewat tenggat" dari luar (AC
     * eksplisit "GET publik hanya lowongan published & belum expired").
     */
    async getPublic(id: string): Promise<JobPublic> {
      const row = await jobsRepository.findById(id);
      if (row === null || !masihAktif(row, now())) throw appError("LOWONGAN_TIDAK_DITEMUKAN");
      return keProfilPublik(row);
    },

    /**
     * Lowongan `published` DAN aktif milik satu perusahaan (dipakai
     * `modules/companies` — PR-054/055, komunikasi antar-modul lewat lapisan
     * service, bukan repository). TIDAK memvalidasi keberadaan perusahaannya
     * sendiri — itu tanggung jawab pemanggil (`companies.service.ts` sudah
     * memeriksanya lebih dulu).
     */
    async listActiveByCompany(companyId: string): Promise<JobPublicSummary[]> {
      const rows = await jobsRepository.listActiveByCompany(companyId);
      return rows.map(keRingkasan);
    },

    /**
     * Bahan embedding (PR-069). `null` untuk lowongan yang tidak ada ATAU
     * tidak aktif — lowongan yang sudah ditutup/lewat tenggat tidak akan
     * pernah dicocokkan, jadi menghitung vektornya hanya membakar kuota.
     */
    async bacaUntukEmbedding(id: string): Promise<JobUntukEmbedding | null> {
      const row = await jobsRepository.findById(id);
      if (row === null || !masihAktif(row, now())) return null;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        requirements: row.requirements,
        createdBy: row.createdBy,
      };
    },

    /**
     * Bahan re-rank (PR-072) untuk banyak lowongan sekaligus. Yang sudah tidak
     * aktif TIDAK dikembalikan — pemanggil memperlakukannya sebagai hilang.
     */
    async bacaUntukRerank(ids: readonly string[]): Promise<JobUntukRerank[]> {
      const rows = await jobsRepository.listActiveByIds(ids);
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        requirements: row.requirements,
        workMode: row.workMode,
        city: row.city,
        province: row.province,
        accommodations: row.accommodations,
      }));
    },

    /** Kartu feed (PR-073) untuk lowongan AKTIF di antara `ids`; urutan tak dijamin. */
    async bacaUntukFeed(ids: readonly string[]): Promise<JobUntukFeed[]> {
      const rows = await jobsRepository.listActiveByIds(ids);
      return rows.map((row) => ({
        kartu: keHasilPencarian({
          ...row,
          // `publish()` selalu menulis `publishedAt`; jaring untuk baris seed lama.
          publishedAt: row.publishedAt ?? row.createdAt,
        }),
        requirements: row.requirements,
        description: row.description,
      }));
    },

    /**
     * Ringkasan lowongan untuk "Lamaran Saya" (PR-076, modul `applications`
     * lewat lapisan service). Termasuk yang sudah ditutup/kedaluwarsa —
     * `aktif` memberi tahu bedanya; draft tidak mungkin berlamaran.
     */
    async ringkasanUntukLamaran(
      ids: readonly string[],
    ): Promise<Array<{ id: string; title: string; companyName: string; aktif: boolean }>> {
      const rows = await jobsRepository.listByIdsWithCompany(ids);
      const saatIni = now();
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        companyName: row.companyName,
        aktif: masihAktif(row, saatIni),
      }));
    },

    /** GET /api/v1/admin/jobs — seluruh lowongan, tanpa pagination (skala pilot). */
    async listAdmin(): Promise<JobAdmin[]> {
      const rows = await jobsRepository.listAdmin();
      return rows.map(keProfilAdmin);
    },

    /** POST /api/v1/admin/jobs — lahir selalu `draft` (bawaan kolom Prisma). */
    async create(actor: JobsActor, input: CreateJob): Promise<JobAdmin> {
      const id = uuidV7();
      const hasil = await jobsRepository.create(id, { ...input, createdBy: actor.userId });
      if (hasil === "perusahaan-tidak-ada") throw appError("PERUSAHAAN_TIDAK_DITEMUKAN");

      catatPerubahan(actor, id, "create");
      return keProfilAdmin(hasil);
    },

    /** PUT /api/v1/admin/jobs/:id — patch sebagian; TIDAK menyentuh `status` (lihat `updateJobSchema`). */
    async update(actor: JobsActor, id: string, input: UpdateJob): Promise<JobAdmin> {
      // `expiresAt` string ISO (kontrak) → `Date` (repository/Prisma) — satu-satunya
      // field yang bentuknya berbeda antara kedua lapisan di objek patch ini.
      const { expiresAt, ...sisa } = input;
      const patch: JobUpdatePatch = {
        ...sisa,
        ...(expiresAt !== undefined && {
          expiresAt: expiresAt === null ? null : new Date(expiresAt),
        }),
      };
      const row = await jobsRepository.update(id, patch);
      if (row === null) throw appError("LOWONGAN_TIDAK_DITEMUKAN");

      catatPerubahan(actor, id, "update");
      // Hanya lowongan yang SUDAH tayang (PR-069): vektornya dipakai pencocokan
      // dan harus mengikuti isi terbarunya. Draft belum punya vektor, dan
      // `job.published` nanti membawa isinya yang terakhir. Lowongan `closed`
      // tidak lagi dicocokkan, jadi menyuntingnya juga tidak perlu kabar.
      if (row.status === "published") {
        events.emit("job.updated", {
          jobId: id,
          companyId: row.companyId,
          updatedAt: row.updatedAt.toISOString(),
        });
      }
      return keProfilAdmin(row);
    },

    /**
     * POST /api/v1/admin/jobs/:id/publish — satu-satunya jalan menuju
     * `status: "published"`. Menolak selain dari `draft` (AC "transisi ilegal
     * ditolak") dan menolak akomodasi kosong (AC "publish tanpa akomodasi →
     * 422") SEBELUM menyentuh baris sama sekali.
     */
    async publish(actor: JobsActor, id: string): Promise<JobAdmin> {
      const sebelum = await jobsRepository.findById(id);
      if (sebelum === null) throw appError("LOWONGAN_TIDAK_DITEMUKAN");
      if (sebelum.status !== "draft") throw appError("TRANSISI_STATUS_TIDAK_VALID");
      if (sebelum.accommodations.length === 0) throw appError("AKOMODASI_LOWONGAN_KOSONG");

      const waktu = now();
      const row = await jobsRepository.publish(id, waktu);
      if (row === null) throw appError("LOWONGAN_TIDAK_DITEMUKAN");

      catatPerubahan(actor, id, "publish");
      events.emit("job.published", {
        jobId: id,
        companyId: row.companyId,
        publishedAt: waktu.toISOString(),
      });

      return keProfilAdmin(row);
    },

    /**
     * POST /api/v1/admin/jobs/:id/close — satu-satunya jalan admin menuju
     * `status: "closed"`. Menolak selain dari `published`. Menerbitkan
     * `job.closed` yang SAMA dengan penutupan otomatis (PR-024b), dibedakan
     * lewat `reason: "closed_by_admin"` — pelanggan event tidak perlu
     * mendengarkan dua nama event untuk satu transisi yang sama.
     */
    async close(actor: JobsActor, id: string): Promise<JobAdmin> {
      const sebelum = await jobsRepository.findById(id);
      if (sebelum === null) throw appError("LOWONGAN_TIDAK_DITEMUKAN");
      if (sebelum.status !== "published") throw appError("TRANSISI_STATUS_TIDAK_VALID");

      const waktu = now();
      const row = await jobsRepository.close(id);
      if (row === null) throw appError("LOWONGAN_TIDAK_DITEMUKAN");

      catatPerubahan(actor, id, "close");
      events.emit("job.closed", {
        jobId: id,
        closedAt: waktu.toISOString(),
        reason: "closed_by_admin",
      });

      return keProfilAdmin(row);
    },

    /**
     * DELETE /api/v1/admin/jobs/:id — lowongan BERLAMARAN ditolak (FK
     * Restrict DB, SDD §6.1; ditangkap `jobsRepository.delete`, bukan
     * dicek dulu di sini — constraint database adalah kebenaran tunggal,
     * mengeceknya dua kali di service hanya membuka celah balapan antara
     * pengecekan dan penghapusan). "close" adalah jalur resmi untuk
     * menyingkirkan lowongan yang sudah berlamaran (AC eksplisit).
     */
    async remove(actor: JobsActor, id: string): Promise<void> {
      const hasil = await jobsRepository.delete(id);
      if (hasil === "tidak-ditemukan") throw appError("LOWONGAN_TIDAK_DITEMUKAN");
      if (hasil === "berlamaran") throw appError("LOWONGAN_BERLAMARAN_TIDAK_BISA_DIHAPUS");

      catatPerubahan(actor, id, "delete");
    },

    /**
     * GET /api/v1/jobs — pencarian publik (PR-056, ADR-018).
     *
     * Cursor didekode DI SINI (bukan controller) supaya `KursorTidakValidError`
     * mengikuti pola yang sama dengan `notifications.service.ts`: kesalahan
     * INPUT yang controller petakan ke 400, bukan lolos ke repository sebagai
     * `undefined` yang diam-diam berarti "halaman pertama". Mengambil
     * `limit + 1` baris lalu membuang yang terakhir — pola sama
     * `notifications.service.ts` — adalah cara mengetahui ada-tidaknya halaman
     * berikutnya tanpa query hitung kedua.
     */
    async search(input: JobSearchQuery): Promise<JobSearchResponse> {
      const cursor = input.cursor === undefined ? undefined : decodeKursor(input.cursor);

      const rows = await jobsRepository.search({
        query: input.query,
        city: input.city,
        province: input.province,
        workMode: input.workMode,
        accommodations: input.accommodations,
        limit: input.limit + 1,
        cursor,
      });

      const adaLagi = rows.length > input.limit;
      const halaman = adaLagi ? rows.slice(0, input.limit) : rows;
      const terakhir = halaman.at(-1);

      return {
        data: halaman.map(keHasilPencarian),
        meta: {
          nextCursor:
            adaLagi && terakhir !== undefined
              ? encodeKursor({ sortAt: terakhir.publishedAt, id: terakhir.id })
              : null,
        },
      };
    },
  };
}

export type JobsService = ReturnType<typeof createJobsService>;
