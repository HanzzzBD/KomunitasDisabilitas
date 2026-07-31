// modules/internal — service: ringkasan kedalaman antrean & DLQ (SDD §17).
import {
  QUEUE_NAMES,
  dlqNameOf,
  type InternalQueuesResponse,
  type QueueCounts,
  type QueueName,
  type QueueStatus,
} from "@incasif/schemas";
import type { QueueLike, QueueRegistry } from "../../../core/queue/index.js";

export interface QueuesServiceDeps {
  registry: QueueRegistry;
  /** Queue DLQ pendamping (`<queue>-dlq`) — dibuat malas oleh pemanggil. */
  dlqQueueOf: (dlqName: string) => QueueLike;
}

function bacaCacah(mentah: Record<string, number>): QueueCounts {
  return {
    waiting: mentah.waiting ?? 0,
    active: mentah.active ?? 0,
    delayed: mentah.delayed ?? 0,
    failed: mentah.failed ?? 0,
    completed: mentah.completed ?? 0,
  };
}

export function createQueuesService(deps: QueuesServiceDeps) {
  async function statusSatu(name: QueueName): Promise<QueueStatus> {
    const [cacahQueue, cacahDlq] = await Promise.all([
      deps.registry.queueOf(name).getJobCounts(),
      deps.dlqQueueOf(dlqNameOf(name)).getJobCounts(),
    ]);

    const dlq = bacaCacah(cacahDlq);
    return {
      name,
      counts: bacaCacah(cacahQueue),
      // Catatan DLQ tidak pernah diproses (tidak ada worker-nya), jadi ia
      // menumpuk sebagai waiting; delayed disertakan agar tidak ada yang luput.
      dlqDepth: dlq.waiting + dlq.delayed + dlq.active,
      concurrency: deps.registry.configOf(name).concurrency,
    };
  }

  return {
    /** Ringkasan seluruh queue. Satu queue error → seluruh permintaan gagal (tidak menyembunyikan masalah). */
    async status(): Promise<InternalQueuesResponse> {
      const queues = await Promise.all(QUEUE_NAMES.map(statusSatu));
      return {
        queues,
        dlqTotal: queues.reduce((total, queue) => total + queue.dlqDepth, 0),
      };
    },
  };
}

export type QueuesService = ReturnType<typeof createQueuesService>;
