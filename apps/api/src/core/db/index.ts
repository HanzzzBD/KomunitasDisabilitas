// core/db — koneksi PostgreSQL placeholder (PR-008).
// Pakai klien `pg` ringan hanya untuk readiness ping; PR-010 mengganti isi
// pingDatabase() dengan prisma.$queryRaw tanpa mengubah pemakainya.
import pg from "pg";
import type { Env } from "../config/index.js";

export interface DbClient {
  /** SELECT 1 dengan timeout — true bila DB terjangkau. */
  ping(): Promise<boolean>;
  /** Tutup pool saat shutdown. */
  end(): Promise<void>;
}

export function createDbClient(env: Pick<Env, "DATABASE_URL">): DbClient {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 2, // hanya untuk ping — pool aplikasi sesungguhnya milik Prisma (PR-010)
    connectionTimeoutMillis: 2000,
  });
  // Error idle client (mis. DB restart) tidak boleh menjatuhkan proses.
  pool.on("error", () => {});

  return {
    async ping() {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    async end() {
      await pool.end();
    },
  };
}
