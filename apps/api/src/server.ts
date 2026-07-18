// Bootstrap server Express — start/stop bersih (PR-006) + middleware stack
// baku core/http (PR-007). Koneksi DB/Redis & health = PR-008.
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { Env } from "./core/config/index.js";
import { createHttpLogger, type Logger } from "./core/logger/index.js";
import {
  createHelmet,
  createCors,
  createGlobalRateLimit,
  notFoundHandler,
  errorHandler,
} from "./core/http/index.js";

export interface ApiServer {
  app: Express;
  /** Mulai listen; resolve setelah siap menerima koneksi. */
  start(): Promise<{ port: number }>;
  /** Tutup bersih: berhenti menerima koneksi baru, tunggu yang aktif selesai. */
  stop(): Promise<void>;
}

export interface CreateServerOptions {
  /** Titik mount router modul (dipanggil sebelum notFound/errorHandler). */
  routes?: (app: Express) => void;
}

export function createServer(
  env: Env,
  logger: Logger,
  options: CreateServerOptions = {},
): ApiServer {
  const app = express();

  // Urutan middleware baku (PR-007): security → logging → parsing → routes
  // → 404 → error handler. Jangan ubah urutan tanpa membaca SDD §5.3.
  app.disable("x-powered-by");
  app.use(createHelmet());
  app.use(createCors(env));
  app.use(createGlobalRateLimit(env));
  app.use(createHttpLogger(logger));
  app.use(express.json({ limit: "1mb" }));

  options.routes?.(app); // router modul (PR-008+: health; PR-016+: auth; dst.)

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  let server: Server | null = null;

  return {
    app,

    start() {
      const bootStart = performance.now();
      return new Promise((resolvePromise, rejectPromise) => {
        server = app
          .listen(env.PORT, env.HOST, () => {
            const address = server?.address();
            const port = typeof address === "object" && address !== null ? address.port : env.PORT;
            logger.info(
              { port, host: env.HOST, bootMs: Math.round(performance.now() - bootStart) },
              "API siap menerima koneksi",
            );
            resolvePromise({ port });
          })
          .once("error", rejectPromise);
      });
    },

    stop() {
      return new Promise((resolvePromise, rejectPromise) => {
        if (server === null) {
          resolvePromise();
          return;
        }
        logger.info("Menutup server (menunggu koneksi aktif selesai)…");
        server.close((err) => {
          server = null;
          if (err) rejectPromise(err);
          else {
            logger.info("Server tertutup bersih");
            resolvePromise();
          }
        });
      });
    },
  };
}

/**
 * Pasang handler SIGTERM/SIGINT → graceful shutdown. Dipisah dari
 * createServer supaya test bisa membuat server tanpa menyentuh handler
 * global proses. exitFn injectable untuk test (default process.exit).
 */
export function registerShutdownHooks(
  api: ApiServer,
  logger: Logger,
  exitFn: (code: number) => void = process.exit,
): void {
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return; // sinyal ganda: abaikan, shutdown sudah berjalan
    shuttingDown = true;
    logger.info({ signal }, "Menerima sinyal berhenti");
    api
      .stop()
      .then(() => exitFn(0))
      .catch((err: unknown) => {
        logger.error({ err }, "Gagal menutup server dengan bersih");
        exitFn(1);
      });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
