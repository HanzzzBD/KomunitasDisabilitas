import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { createLogger, REDACTED } from "../src/core/logger/index.js";

/** Tangkap output pino ke array baris JSON ter-parse. */
function captureLogger(level: "info" | "debug" = "info") {
  const lines: Array<Record<string, unknown>> = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const line of chunk.toString("utf8").split("\n")) {
        if (line.trim() !== "") lines.push(JSON.parse(line) as Record<string, unknown>);
      }
      cb();
    },
  });
  const logger = createLogger({ LOG_LEVEL: level }, { destination });
  return { logger, lines };
}

const SECRET = "nilai-sangat-rahasia-123";

describe("createLogger — JSON terstruktur", () => {
  it("output JSON valid dengan level label, service, timestamp ISO", () => {
    const { logger, lines } = captureLogger();
    logger.info({ halo: "dunia" }, "pesan uji");
    expect(lines[0]).toMatchObject({
      level: "info",
      service: "api",
      halo: "dunia",
      msg: "pesan uji",
    });
    expect(String(lines[0]?.time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("menghormati LOG_LEVEL (debug tidak keluar pada level info)", () => {
    const { logger, lines } = captureLogger("info");
    logger.debug("tidak boleh muncul");
    logger.info("muncul");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.msg).toBe("muncul");
  });
});

describe("redaction — nilai secret tidak pernah menyentuh output (AC PR-006)", () => {
  it.each([
    "otp",
    "password",
    "token",
    "accessToken",
    "refreshToken",
    "fieldKey",
    "apiKey",
    "secret",
    "authorization",
    "cookie",
  ])("field level-atas %s di-redact", (field) => {
    const { logger, lines } = captureLogger();
    logger.info({ [field]: SECRET }, "uji");
    const raw = JSON.stringify(lines[0]);
    expect(raw).not.toContain(SECRET);
    expect(lines[0]?.[field]).toBe(REDACTED);
  });

  it("field bersarang satu level (mis. body.otp, user.password) di-redact", () => {
    const { logger, lines } = captureLogger();
    logger.info({ body: { otp: SECRET }, user: { password: SECRET } }, "uji");
    const raw = JSON.stringify(lines[0]);
    expect(raw).not.toContain(SECRET);
  });

  it("header authorization/cookie pada objek req di-redact", () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        req: {
          headers: {
            authorization: `Bearer ${SECRET}`,
            cookie: `sid=${SECRET}`,
            "x-api-key": SECRET,
          },
        },
      },
      "uji",
    );
    expect(JSON.stringify(lines[0])).not.toContain(SECRET);
  });

  it("field non-sensitif TIDAK ikut ter-redact (deny list tepat sasaran)", () => {
    const { logger, lines } = captureLogger();
    logger.info({ userIdHash: "abc123", durasiMs: 42 }, "uji");
    expect(lines[0]?.userIdHash).toBe("abc123");
    expect(lines[0]?.durasiMs).toBe(42);
  });
});
