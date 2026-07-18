// Entry point apps/api — fail-fast env, lalu boot (PR-006).
/* eslint-disable no-console -- sebelum logger siap, satu-satunya saluran adalah console */
import { loadEnv, EnvError } from "./core/config/index.js";
import { createLogger } from "./core/logger/index.js";
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
const api = createServer(env, logger);
registerShutdownHooks(api, logger);

try {
  await api.start();
} catch (err) {
  logger.fatal({ err }, "Gagal memulai server");
  process.exit(1);
}
