// core/db — koneksi PostgreSQL.
//
// Dua klien hidup berdampingan (utang terdaftar, pemiliknya PR-097):
//   - `pg` ringan  → HANYA readiness ping (PR-008)
//   - Prisma       → klien aplikasi untuk repository modul (mulai PR-016)
// PR-097 menyatukan keduanya; sampai saat itu jangan menambah pemakai `pg`.
import pg from "pg";
import { PrismaClient } from "@prisma/client";
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

/**
 * Klien Prisma aplikasi. Dibuat sekali di entry point lalu di-inject ke
 * repository modul (repository TIDAK boleh membuat koneksinya sendiri).
 * Koneksi Prisma bersifat malas — boot API tidak menunggu database.
 */
export function createPrismaClient(): PrismaClient {
  // Query log sengaja mati: parameter query bisa memuat PII (nomor HP, dsb.).
  return new PrismaClient({ log: ["warn", "error"] });
}
