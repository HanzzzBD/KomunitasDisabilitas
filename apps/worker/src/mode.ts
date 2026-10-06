import { QUEUE_NAME } from "@nawasena/schemas";
import type { ProcessorMap } from "@nawasena/api/core/queue";

export type WorkerMode = "all" | "cv" | "notifications";

export function workerMode(args: readonly string[]): WorkerMode {
  if (args.length === 0) return "all";
  if (args.length === 1 && args[0] === "--cv-only") return "cv";
  if (args.length === 1 && args[0] === "--notifications-only") return "notifications";
  throw new Error("Mode worker tidak dikenal. Gunakan --cv-only atau --notifications-only.");
}

export function selectProcessors(processors: ProcessorMap, mode: WorkerMode): ProcessorMap {
  if (mode === "all") return processors;
  const names: readonly string[] =
    mode === "cv"
      ? [QUEUE_NAME.PDF_RENDER, QUEUE_NAME.AI_EXTRACT_RESUME, QUEUE_NAME.AI_USAGE_RECORD]
      : [QUEUE_NAME.NOTIFY_PUSH, QUEUE_NAME.NOTIFY_EMAIL];
  return Object.fromEntries(
    Object.entries(processors).filter(
      ([name, processor]) => names.includes(name) && processor !== undefined,
    ),
  );
}
