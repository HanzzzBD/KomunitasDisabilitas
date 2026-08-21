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
import type { EventBus } from "../../core/events/index.js";
import { createFieldCrypto, type FieldKeys } from "../../core/crypto/index.js";
import { createProfileRepository } from "./repositories/profile.repository.js";
import {
  createEducationRepository,
  createExperienceRepository,
  createSkillRepository,
} from "./repositories/career.repository.js";
import { createProfilesService } from "./services/profiles.service.js";
import {
  createEducationsService,
  createExperiencesService,
  createSkillsService,
} from "./services/career.service.js";
import { createProfileExportContributor } from "./services/profile-export.service.js";
import { createSensitiveAccess } from "./services/sensitive-access.service.js";
import { createProfilesController } from "./controllers/profiles.controller.js";
import { createKarierController } from "./controllers/career.controller.js";
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
  /**
   * Penerbit `profile.updated` (PR-038). Pelanggannya belum ada — perhitungan
   * ulang embedding lahir di PR-069 — dan bus-nya memang boleh tanpa pelanggan:
   * `emit` menjadi no-op yang tetap bertipe benar.
   */
  events: EventBus;
}

export interface ProfilesModule {
  router: Router;
  /**
   * Bagian `profile` berkas ekspor PDP, untuk diserahkan ke `createUsersModule`
   * (PR-038, utang yang ditinggalkan PR-037).
   *
   * DIKEMBALIKAN, tidak didaftarkan sendiri. Agregator ekspornya milik modul
   * `users`, dan satu-satunya jalan masuk ke sana adalah parameter — bukan
   * registry global yang bisa diisi kapan saja oleh siapa saja. Akibatnya
   * boot.ts harus merakit modul ini lebih dulu, dan itu memang yang diinginkan:
   * ketergantungannya terbaca di composition root, bukan tersembunyi.
   */
  exportContributor: ReturnType<typeof createProfileExportContributor>;
  /**
   * Kontrol akses data sensitif terpusat (PR-039).
   *
   * BELUM ADA SATU PUN PEMANGGILNYA HARI INI, dan itu disengaja — persis seperti
   * `core/events` yang lahir sebelum pelanggan pertamanya. Konsumennya sudah
   * bernama dan sudah terjadwal: admin/support (Phase 13), matching (PR-069),
   * disclosure per lamaran (PR-075). Yang tidak boleh terjadi adalah ketiganya
   * lahir lebih dulu, masing-masing membaca kolom sensitif dengan caranya
   * sendiri, lalu audit dipasang belakangan pada tiga tempat yang sudah
   * berbeda-beda.
   *
   * Dikembalikan, bukan dipasang sebagai route: PR ini TIDAK menambah endpoint
   * apa pun (lihat dokumen phase — "API Changes: tidak ada, internal").
   */
  sensitiveAccess: ReturnType<typeof createSensitiveAccess>;
}

export function createProfilesModule(deps: ProfilesModuleDeps): ProfilesModule {
  const karier = { events: deps.events };

  const profileRepository = createProfileRepository(deps.prisma);
  const crypto = createFieldCrypto(deps.fieldKeys);

  const profiles = createProfilesService({
    profileRepository,
    crypto,
    auditLog: deps.auditLog,
    events: deps.events,
  });
  const experiences = createExperiencesService(createExperienceRepository(deps.prisma), karier);
  const educations = createEducationsService(createEducationRepository(deps.prisma), karier);
  const skills = createSkillsService(createSkillRepository(deps.prisma), karier);

  return {
    router: createProfilesRouter(
      createProfilesController(profiles),
      {
        experiences: createKarierController(experiences),
        educations: createKarierController(educations),
        skills: createKarierController(skills),
      },
      deps.routes,
    ),
    // Service yang SAMA dengan yang melayani endpoint — bukan salinan kedua.
    // Ekspor yang membaca lewat jalur berbeda adalah ekspor yang bisa menyimpang
    // dari apa yang dilihat pemiliknya di layar, dan tidak ada test yang akan
    // menangkap perbedaan itu sampai seseorang membandingkan keduanya.
    exportContributor: createProfileExportContributor({
      profiles,
      experiences,
      educations,
      skills,
    }),
    // Repository dan crypto yang SAMA dengan yang melayani pemiliknya. Instance
    // kedua akan berarti dua tempat yang harus sama-sama benar saat kunci
    // dirotasi (docs/runbook-keys.md).
    sensitiveAccess: createSensitiveAccess({
      profileRepository,
      crypto,
      auditLog: deps.auditLog,
    }),
  };
}

export {
  createProfileRepository,
  type HasilSimpan,
  type ProfileRepository,
  type SafeProfileRow,
  type SeekerProfilePatch,
  type SeekerProfileRow,
} from "./repositories/profile.repository.js";
export {
  createEducationRepository,
  createExperienceRepository,
  createSkillRepository,
  type CareerRepository,
  type EducationData,
  type EducationRow,
  type ExperienceData,
  type ExperienceRow,
  type SkillData,
  type SkillRow,
} from "./repositories/career.repository.js";
export {
  createProfilesService,
  keProfil,
  type ProfilesActor,
  type ProfilesService,
} from "./services/profiles.service.js";
export {
  createBagianKarier,
  createEducationsService,
  createExperiencesService,
  createSkillsService,
  type BagianKarier,
} from "./services/career.service.js";
export {
  createProfileExportContributor,
  type ProfileExportDeps,
} from "./services/profile-export.service.js";
export {
  createSensitiveAccess,
  KEBIJAKAN_AUDIT,
  type SensitiveAccess,
  type SensitiveAccessDeps,
  type TujuanAksesLain,
} from "./services/sensitive-access.service.js";
export {
  createProfilesController,
  type ProfilesController,
} from "./controllers/profiles.controller.js";
export {
  createKarierController,
  type KarierController,
} from "./controllers/career.controller.js";
export { createProfilesRouter, type KarierControllers } from "./routers/index.js";
