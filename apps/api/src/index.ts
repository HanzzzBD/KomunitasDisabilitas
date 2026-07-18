// Entry point apps/api — fail-fast env, lalu boot (PR-006; wiring modul PR-008).
/* eslint-disable no-console -- sebelum logger siap, satu-satunya saluran adalah console */
import { loadEnv, EnvError } from "./core/config/index.js";
import { createLogger } from "./core/logger/index.js";
import { createDbClient } from "./core/db/index.js";
import { createRedisClients } from "./core/redis/index.js";
import { createHealthModule } from "./modules/health/index.js";
import { createServer, registerShutdownHooks } from "./server.js";

let env;
try {
  env = loadEnv();
} catch (err) {
  // Logger belum bisa dibuat (butuh env valid) → console + exit ≠ 0.
  console.error(err instanceof EnvError ? err.message : err);
  process.exit(1);
}

const logger = createLogger(env);
const db = createDbClient(env);
const redis = createRedisClients(env);

const api = createServer(env, logger, {
  routes: (app) => {
    app.use(createHealthModule(db, redis)); // /healthz /readyz (root, non-versioned)
  },
});

registerShutdownHooks(api, logger, undefined, async () => {
  // Setelah server berhenti menerima koneksi: tutup koneksi infra.
  await Promise.allSettled([db.end(), redis.end()]);
});

try {
  await api.start();
} catch (err) {
  logger.fatal({ err }, "Gagal memulai server");
  process.exit(1);
}
