// core/db — koneksi PostgreSQL.
//
// Dua klien hidup berdampingan (utang terdaftar, pemiliknya PR-097):
//   - `pg` ringan  → HANYA readiness ping (PR-008)
//   - Prisma       → klien aplikasi untuk repository modul (mulai PR-016)
// PR-097 menyatukan keduanya; sampai saat itu jangan menambah pemakai `pg`.
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import type { Env } from "../config/index.js";
import { terapkanFilterAktif } from "./soft-delete.js";

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
 * Klien Prisma aplikasi seperti dilihat modul: `PrismaClient` DIKURANGI dua
 * metode yang tidak ada pada klien ber-ekstensi.
 *
 * `$use` (middleware) hilang DENGAN SENGAJA — dan hilangnya adalah fiturnya.
 * Ia deprecated di Prisma 5 dan dihapus di Prisma 6; menutup pintunya sekarang
 * mencegah lahirnya middleware yang akan mati diam-diam saat upgrade. `$on`
 * ikut hilang sebagai konsekuensi teknis `$extends`; tidak ada yang memakainya.
 */
export type AppPrisma = Omit<PrismaClient, "$on" | "$use">;

/**
 * Klien Prisma aplikasi. Dibuat sekali di entry point lalu di-inject ke
 * repository modul (repository TIDAK boleh membuat koneksinya sendiri).
 * Koneksi Prisma bersifat malas — boot API tidak menunggu database.
 *
 * Penjaga soft delete dipasang DI SINI, bukan di tiap repository: satu-satunya
 * cara sebuah query users bisa melihat baris terhapus adalah menyebut
 * `deletedAt` sendiri (lihat soft-delete.ts). Repository yang lupa menyaring
 * tetap aman — itulah seluruh alasan penjaganya ada.
 */
export function createPrismaClient(): AppPrisma {
  // Query log sengaja mati: parameter query bisa memuat PII (nomor HP, dsb.).
  const dasar = new PrismaClient({ log: ["warn", "error"] });
  const berpenjaga = dasar.$extends({
    name: "nawasena-soft-delete-users",
    query: {
      user: {
        $allOperations({ operation, args, query }) {
          return query(terapkanFilterAktif(operation, args) as typeof args);
        },
      },
    },
  });

  // Cast yang DISENGAJA, dan hanya menyangkut satu hal: TypeScript tidak bisa
  // menyamakan dua overload `$transaction` (bentuk array vs bentuk callback)
  // antara klien polos dan klien ber-ekstensi, meski keduanya menerima kedua
  // bentuk itu. Yang berbeda hanyalah urutan overload-nya, bukan perilakunya —
  // klien di dalam callback justru SUPERSET: ekstensi ikut berlaku di sana,
  // yang memang kita inginkan (lihat deleteAccount di repository auth).
  return berpenjaga as unknown as AppPrisma;
}
