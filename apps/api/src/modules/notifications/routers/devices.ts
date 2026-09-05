// modules/notifications — router perangkat. Path relatif; prefix `/api/v1`
// dipegang registrar.
//
// `access.authenticated()` dengan alasan yang sama seperti seluruh `/me/*`:
// tidak ada param `:userId` untuk dibandingkan `requireSelf`, dan identitas
// datang dari sesi sehingga tidak ada saluran untuk menyebut orang lain.
import type { Router } from "express";
import { registerDeviceSchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { DevicesController } from "../controllers/devices.controller.js";

export function daftarkanRouteDevices(
  controller: DevicesController,
  routes: RouteRegistrar,
): Router {
  routes.post(
    "/me/devices",
    access.authenticated(),
    // Batas panjang token dan daftar platform yang sah ada di skema, bukan di
    // service: satu tempat untuk aturan yang sama-sama dipakai klien mobile
    // (PR-088/094) dan server. Platform di luar enum ditolak 400 di gerbang,
    // bukan diteruskan ke Prisma sebagai nilai enum yang tidak ada.
    validate({ body: registerDeviceSchema }),
    asyncHandler(controller.register),
  );
  return routes.router;
}
