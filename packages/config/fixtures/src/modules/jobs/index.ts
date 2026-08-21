// AKAR PERAKITAN modul — pola yang didokumentasikan CLAUDE.md §5.3, ditulis
// dengan penentu ber-ekstensi `.js` seperti kode sungguhan.
//
// Berkas ini menyentuh KEEMPAT lapisan modulnya sendiri, dan itu memang tugasnya:
// merakit router, controller, service, dan repository menjadi satu modul siap
// pasang (DI manual via factory, ADR-002). Ia harus BEBAS pelanggaran.
import { jobsRouter } from "./routers/jobs.router.js";
import { jobsController } from "./controllers/jobs.controller.js";
import { jobsService } from "./services/jobs.service.js";
import { jobsRepository } from "./repositories/jobs.repository.js";

export const jobsModule = {
  router: jobsRouter,
  controller: jobsController,
  service: jobsService,
  repository: jobsRepository,
};
