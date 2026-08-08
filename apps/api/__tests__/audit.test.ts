import { describe, it, expect, vi } from "vitest";
import {
  AUDIT_ACTION,
  type AuditAction,
  type AuditActor,
} from "@nawasena/schemas";
import {
  AUDIT_METRIC,
  createAuditLog,
  sanitizeAuditMeta,
  type AuditEntry,
  type AuditLoggerOptions,
} from "../src/core/audit/index.js";

const ACTOR: AuditActor = {
  actorId: "01912345-89ab-7def-8123-456789abcdef",
  requestId: "01912345-89ab-7def-8123-456789abcdea",
};
const ENTITY_ID = "01912345-89ab-7def-8123-456789abcdeb";

const META_AMAN: Record<AuditAction, Record<string, unknown>> = {
  [AUDIT_ACTION.AUTH_LOGIN_FAILED]: { reason: "otpInvalid" },
  [AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED]: { method: "google", isNewUser: true },
  [AUDIT_ACTION.AUTH_REFRESH_REUSED]: { revokedCount: 2 },
  [AUDIT_ACTION.PROFILE_SENSITIVE_READ]: {
    purpose: "support",
    fields: ["disabilityTypes"],
  },
  [AUDIT_ACTION.PROFILE_SENSITIVE_UPDATED]: { fields: ["accommodationNeeds"] },
  [AUDIT_ACTION.APPLICATION_STATUS_CHANGED]: { from: "viewed", to: "interview" },
  [AUDIT_ACTION.COMPANY_VERIFIED]: { from: "selfClaimed", to: "verified" },
  [AUDIT_ACTION.ADMIN_RESOURCE_CHANGED]: { operation: "publish" },
  [AUDIT_ACTION.DATA_EXPORTED]: { format: "json", formatVersion: 1, sections: ["account"] },
  [AUDIT_ACTION.ACCOUNT_EMAIL_CHANGED]: { hadPreviousEmail: true, cleared: false },
  [AUDIT_ACTION.ACCOUNT_DELETED]: { stage: "completed", method: "otp", revokedCount: 2 },
  [AUDIT_ACTION.DATA_PURGED]: {
    dryRun: false,
    accounts: 1,
    deleted: 1,
    anonymized: 0,
    records: 4,
  },
  [AUDIT_ACTION.DATA_RETAINED]: {
    dryRun: false,
    policy: "refresh_tokens.reuse",
    deleted: 12,
    remaining: 0,
  },
  [AUDIT_ACTION.JOB_AUTO_CLOSED]: { dryRun: false, closed: 3, remaining: 0 },
};

function createOptions(append: (entry: AuditEntry) => Promise<void>): {
  options: AuditLoggerOptions;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  increment: ReturnType<typeof vi.fn>;
} {
  const error = vi.fn();
  const warn = vi.fn();
  const increment = vi.fn();
  return {
    options: {
      writer: { append },
      logger: { error, warn } as unknown as AuditLoggerOptions["logger"],
      metrics: { increment },
    },
    error,
    warn,
    increment,
  };
}

describe("sanitizeAuditMeta — allowlist PII per action", () => {
  it.each(Object.values(AUDIT_ACTION) as AuditAction[])(
    "%s membuang PII dan menyimpan hanya meta yang diizinkan",
    (action) => {
      const meta = sanitizeAuditMeta(action, {
        ...META_AMAN[action],
        phone: "nomor-dummy",
        fullName: "Nama Pengguna",
        disabilityTypes: ["tuli"],
        accommodationNeeds: ["juru bahasa"],
      });

      expect(meta).toEqual(META_AMAN[action]);
      expect(JSON.stringify(meta)).not.toContain("nomor-dummy");
      expect(JSON.stringify(meta)).not.toContain("Nama Pengguna");
      expect(JSON.stringify(meta)).not.toContain("juru bahasa");
    },
  );

});

describe("createAuditLog", () => {
  it("baris audit memuat actor, entity, entityId, dan requestId", () => {
    const append = vi.fn(() => Promise.resolve());
    const { options } = createOptions(append);
    const auditLog = createAuditLog(options);

    auditLog(ACTOR, AUDIT_ACTION.APPLICATION_STATUS_CHANGED, "application", ENTITY_ID, {
      from: "viewed",
      to: "interview",
      phone: "nomor-dummy",
    });

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR.actorId,
        action: AUDIT_ACTION.APPLICATION_STATUS_CHANGED,
        entity: "application",
        entityId: ENTITY_ID,
        meta: { requestId: ACTOR.requestId, from: "viewed", to: "interview" },
      }),
    );
  });

  it("penulisan async tidak menunggu writer yang lambat", () => {
    let resolveWrite: (() => void) | undefined;
    const append = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const { options } = createOptions(append);
    const auditLog = createAuditLog(options);

    const startedAt = performance.now();
    auditLog(ACTOR, AUDIT_ACTION.DATA_EXPORTED, "user", ENTITY_ID, {
      format: "json",
      formatVersion: 1,
      sections: ["account"],
    });
    const elapsedMs = performance.now() - startedAt;

    expect(append).toHaveBeenCalledOnce();
    expect(elapsedMs).toBeLessThan(50);
    resolveWrite?.();
  });

  it("kegagalan writer di-log dan menaikkan metrik tanpa PII", async () => {
    const { options, error, increment } = createOptions(() => Promise.reject(new Error("DB gagal")));
    const auditLog = createAuditLog(options);

    auditLog(ACTOR, AUDIT_ACTION.DATA_EXPORTED, "user", ENTITY_ID, {
      format: "json",
      formatVersion: 1,
      sections: ["account"],
      phone: "nomor-dummy",
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(increment).toHaveBeenCalledWith(AUDIT_METRIC.WRITE_FAILED);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: AUDIT_METRIC.WRITE_FAILED,
        requestId: ACTOR.requestId,
      }),
      "Gagal menulis catatan audit",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("nomor-dummy");
  });
});
