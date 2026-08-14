// modules/accessibility — wiring modul (DI manual via factory, ADR-002).
//
// Modul ini punya SATU langganan event, dan langganan itu dipasang di sini —
// bukan di sub-folder `subscribers/`. Dua baris tidak butuh lapisan sendiri;
// logikanya (menyediakan baris bawaan) tetap tinggal di service, persis seperti
// sisi penerbitnya di `modules/jobs/services/expiry.service.ts` yang memanggil
// `events.emit(...)` langsung dari dalam service tanpa abstraksi "publisher".
import type { Router } from "express";
import type { AppPrisma } from "../../core/db/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { AuditLog } from "../../core/audit/index.js";
import type { EventBus } from "../../core/events/index.js";
import { createAccessibilityRepository } from "./repositories/accessibility.repository.js";
import { createAccessibilityService } from "./services/accessibility.service.js";
import { createAccessibilityController } from "./controllers/accessibility.controller.js";
import { createAccessibilityRouter } from "./routers/index.js";

export interface AccessibilityModuleDeps {
  prisma: AppPrisma;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  /**
   * Dipegang demi kesamaan bentuk dengan modul lain, TIDAK dipanggil: preferensi
   * UI bukan data sensitif (lihat komentar model di schema.prisma), jadi
   * mengubahnya tidak melahirkan entri katalog audit baru. Menambahkannya justru
   * akan menenggelamkan jejak yang memang perlu jarang.
   */
  auditLog: AuditLog;
  /** Bus event PROSES API — sumber `auth.user_registered` (PR-034). */
  events: EventBus;
}

export function createAccessibilityModule(deps: AccessibilityModuleDeps): Router {
  void deps.auditLog;

  const service = createAccessibilityService({
    accessibilityRepository: createAccessibilityRepository(deps.prisma),
  });

  // Akun baru → baris preferensi bawaan. Delegasi tipis dengan sengaja: bus
  // sudah menangkap dan mencatat kegagalan pelanggan (core/events), dan
  // try/catch di sini hanya akan menelan error yang seharusnya terlihat.
  //
  // Kembaliannya (pembatal langganan) sengaja tidak disimpan: langganan ini
  // hidup selama proses, sama seperti router yang dikembalikan di bawah.
  //
  // Penerbitnya TIDAK menunggu ini selesai. Jadi `GET /me/accessibility` yang
  // datang tepat setelah registrasi bisa saja belum menemukan barisnya — dan
  // itu bukan kegagalan penyediaan: service menjawab bawaan yang sama nilainya
  // (lihat `getMe`).
  deps.events.on("auth.user_registered", (payload) => service.provisionDefaults(payload.userId));

  return createAccessibilityRouter(createAccessibilityController(service), deps.routes);
}

export {
  createAccessibilityRepository,
  type AccessibilityProfileRow,
  type AccessibilityRepository,
} from "./repositories/accessibility.repository.js";
export {
  createAccessibilityService,
  type AccessibilityActor,
  type AccessibilityService,
} from "./services/accessibility.service.js";
export {
  createAccessibilityController,
  type AccessibilityController,
} from "./controllers/accessibility.controller.js";
export { createAccessibilityRouter } from "./routers/index.js";
