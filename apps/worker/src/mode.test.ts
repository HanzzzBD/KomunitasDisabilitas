import { describe, expect, it, vi } from "vitest";
import { QUEUE_NAME } from "@nawasena/schemas";
import { workerMode, selectProcessors } from "./mode.js";

const processors = Object.fromEntries(Object.values(QUEUE_NAME).map((name) => [name, vi.fn()]));
describe("mode worker lokal", () => {
  it("mode notifikasi hanya mengonsumsi push/email, tanpa cron atau CV", () => {
    expect(Object.keys(selectProcessors(processors, workerMode(["--notifications-only"])))).toEqual(
      [QUEUE_NAME.NOTIFY_PUSH, QUEUE_NAME.NOTIFY_EMAIL],
    );
  });
  it("mode CV tetap mengonsumsi PDF, ekstraksi, dan pencatatan AI", () => {
    expect(Object.keys(selectProcessors(processors, workerMode(["--cv-only"]))).sort()).toEqual(
      [QUEUE_NAME.PDF_RENDER, QUEUE_NAME.AI_EXTRACT_RESUME, QUEUE_NAME.AI_USAGE_RECORD].sort(),
    );
  });
  it("tanpa mode mempertahankan semua konsumen", () => {
    expect(selectProcessors(processors, workerMode([]))).toBe(processors);
  });
  it.each([["--cv-only", "--notifications-only"], ["--notifictions-only"]])(
    "mode campuran/salah ketik ditolak sebelum boot",
    (...args) => {
      expect(() => workerMode(args)).toThrow("Mode worker tidak dikenal");
    },
  );
});
