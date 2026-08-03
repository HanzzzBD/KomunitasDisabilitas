// modules/auth — router. Path relatif; entry point memasangnya di /api/v1.
import { Router } from "express";
import { requestOtpSchema, verifyOtpSchema } from "@nawasena/schemas";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { OtpController } from "../controllers/otp.controller.js";

export function createAuthRouter(controller: OtpController): Router {
  const router = Router();
  router.post(
    "/auth/otp/request",
    validate({ body: requestOtpSchema }),
    asyncHandler(controller.request),
  );
  router.post(
    "/auth/otp/verify",
    validate({ body: verifyOtpSchema }),
    asyncHandler(controller.verify),
  );
  return router;
}
