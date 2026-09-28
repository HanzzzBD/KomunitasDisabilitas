// modules/resumes — wiring modul (DI manual via factory, ADR-002).
//
// Modul ini menerima `maksPerPengguna` yang sudah tervalidasi skema env, bukan
// membaca `process.env` sendiri — aturan yang sama dengan `fieldKeys` di modul
// profiles (ADR-015). Akibatnya: batas yang salah ketik membuat boot GAGAL
// dengan nama variabelnya, bukan menyala lalu berperilaku aneh pada permintaan
// pertama; dan test bisa menjalankan batas lain tanpa menyentuh env global.
import type { Router } from "express";
import type { AppPrisma } from "../../core/db/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import { appError } from "../../core/http/index.js";
import type { ObjectStorage } from "../../core/storage/index.js";
import { createResumesRepository } from "./repositories/resumes.repository.js";
import { createResumesService } from "./services/resumes.service.js";
import { createResumesController } from "./controllers/resumes.controller.js";
import { createResumesRouter } from "./routers/index.js";
import {
  createResumePdfApiService,
  type ResumePdfApiService,
  type ResumePdfJobs,
} from "./pdf/index.js";

export interface ResumesModuleDeps {
  prisma: AppPrisma;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  /** `env.RESUME_MAX_PER_USER` (bawaan 5, AC PR-060). */
  maksPerPengguna: number;
  /** Tanpa konfigurasi storage/queue, endpoint PDF tetap ada dan menjawab 503. */
  pdf?: {
    jobs: ResumePdfJobs;
    storage: Pick<ObjectStorage, "presignDownload">;
  };
}

export interface ResumesModule {
  router: Router;
  /**
   * Service yang SAMA dengan yang melayani endpoint.
   *
   * Dikembalikan untuk PR-066 (CV dari percakapan AI) dan PR-063/064 (render
   * PDF), yang keduanya harus membaca dan menulis CV lewat jalur ini — bukan
   * lewat repository sendiri. Modul yang membaca CV dengan caranya sendiri
   * adalah modul yang batas lima-CV-nya tidak berlaku, dan itu baru akan
   * ketahuan saat seseorang punya dua puluh CV.
   *
   * BELUM ADA PEMANGGILNYA HARI INI, dan itu disengaja — pola yang sama dengan
   * `sensitiveAccess` di modul profiles: konsumennya sudah bernama dan sudah
   * terjadwal.
   */
  service: ReturnType<typeof createResumesService>;
}

export function createResumesModule(deps: ResumesModuleDeps): ResumesModule {
  const service = createResumesService({
    repo: createResumesRepository(deps.prisma),
    maksPerPengguna: deps.maksPerPengguna,
  });
  const pdf: ResumePdfApiService =
    deps.pdf === undefined
      ? {
          request: () => Promise.reject(appError("BELUM_SIAP")),
          status: () => Promise.reject(appError("BELUM_SIAP")),
        }
      : createResumePdfApiService({ resumes: service, ...deps.pdf });

  return {
    router: createResumesRouter(createResumesController(service, pdf), deps.routes),
    service,
  };
}

export {
  createResumesRepository,
  CvDipakaiLamaranError,
  kunciAntreCv,
  type ResumeCreateData,
  type ResumeRow,
  type ResumeSummaryRow,
  type ResumeUpdatePatch,
  type ResumesRepository,
} from "./repositories/resumes.repository.js";
export {
  createResumesService,
  type ResumesActor,
  type ResumesService,
  type ResumesServiceDeps,
} from "./services/resumes.service.js";
export {
  createResumesController,
  type ResumesController,
} from "./controllers/resumes.controller.js";
export { createResumesRouter } from "./routers/index.js";
export * from "./pdf/index.js";
