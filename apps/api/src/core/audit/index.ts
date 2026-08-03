// core/audit — penulis audit append-only, non-blocking, dan bebas PII (SDD §8.3).
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  auditActionSchema,
  auditActorSchema,
  auditEntityIdSchema,
  auditEntitySchema,
  auditMetaSchemas,
  type AuditAction,
  type AuditActor,
} from "@nawasena/schemas";
import type { Logger } from "../logger/index.js";
import { uuidV7 } from "../ids/index.js";

export const AUDIT_METRIC = {
  WRITE_FAILED: "audit_write_failed",
  META_REJECTED: "audit_meta_rejected",
} as const;

export type AuditMetricName = (typeof AUDIT_METRIC)[keyof typeof AUDIT_METRIC];

export interface AuditMetricSink {
  increment(name: AuditMetricName): void;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  meta: Prisma.InputJsonObject;
}

export interface AuditWriter {
  append(entry: AuditEntry): Promise<void>;
}

export interface AuditLoggerOptions {
  writer: AuditWriter;
  logger: Pick<Logger, "error" | "warn">;
  metrics: AuditMetricSink;
}

export type AuditLog = (
  actor: AuditActor,
  action: AuditAction,
  entity: string,
  entityId: string | null,
  meta: unknown,
) => void;

export function sanitizeAuditMeta(action: AuditAction, meta: unknown): Record<string, unknown> | null {
  const parsed = auditMetaSchemas[action].safeParse(meta);
  return parsed.success ? parsed.data : null;
}

export function createPrismaAuditWriter(prisma: PrismaClient): AuditWriter {
  return {
    async append(entry) {
      await prisma.auditLog.create({ data: entry });
    },
  };
}

export function createAuditLog(options: AuditLoggerOptions): AuditLog {
  return (actor, action, entity, entityId, meta) => {
    const parsedActor = auditActorSchema.safeParse(actor);
    const parsedAction = auditActionSchema.safeParse(action);
    const parsedEntity = auditEntitySchema.safeParse(entity);
    const parsedEntityId = auditEntityIdSchema.safeParse(entityId);
    const sanitizedMeta = parsedAction.success ? sanitizeAuditMeta(parsedAction.data, meta) : null;

    if (
      !parsedActor.success ||
      !parsedAction.success ||
      !parsedEntity.success ||
      !parsedEntityId.success ||
      sanitizedMeta === null
    ) {
      options.metrics.increment(AUDIT_METRIC.META_REJECTED);
      options.logger.warn({ metric: AUDIT_METRIC.META_REJECTED }, "Input audit tidak valid");
      return;
    }

    const entry: AuditEntry = {
      id: uuidV7(),
      actorId: parsedActor.data.actorId,
      action: parsedAction.data,
      entity: parsedEntity.data,
      entityId: parsedEntityId.data,
      meta: { requestId: parsedActor.data.requestId, ...sanitizedMeta } as Prisma.InputJsonObject,
    };

    try {
      void options.writer.append(entry).catch(() => {
        options.metrics.increment(AUDIT_METRIC.WRITE_FAILED);
        options.logger.error(
          {
            metric: AUDIT_METRIC.WRITE_FAILED,
            action: entry.action,
            entity: entry.entity,
            entityId: entry.entityId,
            requestId: parsedActor.data.requestId,
          },
          "Gagal menulis catatan audit",
        );
      });
    } catch {
      options.metrics.increment(AUDIT_METRIC.WRITE_FAILED);
      options.logger.error(
        {
          metric: AUDIT_METRIC.WRITE_FAILED,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          requestId: parsedActor.data.requestId,
        },
        "Gagal menulis catatan audit",
      );
    }
  };
}
