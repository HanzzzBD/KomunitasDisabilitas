import { QUEUE_NAME } from "@nawasena/schemas";
import type { ProcessorMap } from "@nawasena/api/core/queue";

export type WorkerMode = "all" | "cv" | "notifications" | "matching";

export function workerMode(args: readonly string[]): WorkerMode {
  if (args.length === 0) return "all";
  if (args.length === 1 && args[0] === "--cv-only") return "cv";
  if (args.length === 1 && args[0] === "--notifications-only") return "notifications";
  if (args.length === 1 && args[0] === "--matching-only") return "matching";
  throw new Error(
    "Mode worker tidak dikenal. Gunakan --cv-only, --notifications-only, atau --matching-only.",
  );
}

export function selectProcessors(processors: ProcessorMap, mode: WorkerMode): ProcessorMap {
  if (mode === "all") return processors;
  const queuesByMode = {
    cv: [QUEUE_NAME.PDF_RENDER, QUEUE_NAME.AI_EXTRACT_RESUME, QUEUE_NAME.AI_USAGE_RECORD],
    notifications: [QUEUE_NAME.NOTIFY_PUSH, QUEUE_NAME.NOTIFY_EMAIL],
    matching: [QUEUE_NAME.AI_EMBED, QUEUE_NAME.AI_RERANK_FEED, QUEUE_NAME.AI_USAGE_RECORD],
  };
  const names: readonly string[] = queuesByMode[mode];
  return Object.fromEntries(
    Object.entries(processors).filter(
      ([name, processor]) => names.includes(name) && processor !== undefined,
    ),
  );
}
