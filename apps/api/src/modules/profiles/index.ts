// modules/profiles — wiring modul (DI manual via factory, ADR-002).
//
// Modul ini menerima `fieldKeys` yang sudah divalidasi di gerbang boot
// (`src/index.ts` → `parseFieldKeys`), bukan membaca env sendiri. Dua akibat
// yang disengaja: proses yang kuncinya salah MATI SAAT BOOT alih-alih menyala
// dan gagal pada permintaan pertama yang menyentuh data disabilitas, dan tidak
// ada satu pun jalan bagi modul untuk memakai kunci selain yang sudah lolos
// pemeriksaan itu.
import type { Router } from "express";
import type { AppPrisma } from "../../core/db/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { AuditLog } from "../../core/audit/index.js";
import { createFieldCrypto, type FieldKeys } from "../../core/crypto/index.js";
import { createProfileRepository } from "./repositories/profile.repository.js";
import { createProfilesService } from "./services/profiles.service.js";
import { createProfilesController } from "./controllers/profiles.controller.js";
import { createProfilesRouter } from "./routers/index.js";

export interface ProfilesModuleDeps {
  prisma: AppPrisma;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  /** Kunci enkripsi field, sudah tervalidasi di boot (ADR-007). */
  fieldKeys: FieldKeys;
  /**
   * DIPAKAI SUNGGUHAN di sini, berbeda dengan modul accessibility. Preferensi
   * UI bukan data sensitif; ragam disabilitas dan kebutuhan akomodasi adalah
   * data pribadi spesifik UU PDP, dan setiap penyimpanan, pengubahan, serta
   * pencabutan consent-nya meninggalkan jejak.
   */
  auditLog: AuditLog;
}

export function createProfilesModule(deps: ProfilesModuleDeps): Router {
  const service = createProfilesService({
    profileRepository: createProfileRepository(deps.prisma),
    crypto: createFieldCrypto(deps.fieldKeys),
    auditLog: deps.auditLog,
  });

  return createProfilesRouter(createProfilesController(service), deps.routes);
}

export {
  createProfileRepository,
  type HasilSimpan,
  type ProfileRepository,
  type SeekerProfilePatch,
  type SeekerProfileRow,
} from "./repositories/profile.repository.js";
export {
  createProfilesService,
  type ProfilesActor,
  type ProfilesService,
} from "./services/profiles.service.js";
export {
  createProfilesController,
  type ProfilesController,
} from "./controllers/profiles.controller.js";
export { createProfilesRouter } from "./routers/index.js";
