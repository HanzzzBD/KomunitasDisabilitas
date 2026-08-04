// Fixture bersama untuk test HTTP yang butuh sesi (PR-018b).
//
// Dipakai auth-otp-http & auth-google-http: sejak PR-018b kedua metode masuk
// menerbitkan pasangan token, jadi keduanya butuh kunci RS256 dan tabel
// refresh_tokens palsu. Ditaruh di satu tempat supaya semantik fake-nya tidak
// menyimpang antar file.
import { generateKeyPairSync } from "node:crypto";

/**
 * Satu pasangan kunci untuk seluruh proses test. Membuat RSA 2048 memakan
 * ~100 ms; membuatnya per test akan menambah menit ke suite tanpa menguji
 * apa pun — bentuk & validasi kunci sudah punya test sendiri.
 */
export const SESSION_KEYS = generateKeyPairSync("rsa", { modulusLength: 2048 });

export interface BarisRefresh {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Bagian `refreshToken` + `$transaction` dari PrismaClient palsu. Semantiknya
 * sengaja meniru yang penting saja: `findUnique` by tokenHash dan `updateMany`
 * yang MENGHORMATI `revokedAt: null` di klausa where — sebab di situlah letak
 * anti-balapan rotasi. Semantik transaksi sungguhan tetap hanya terbukti di
 * auth-session-db.test.ts terhadap PostgreSQL nyata.
 */
export function fakeRefreshTokenStore() {
  const rows: BarisRefresh[] = [];

  const refreshToken = {
    create: ({ data }: { data: Omit<BarisRefresh, "revokedAt"> }) => {
      rows.push({ ...data, revokedAt: null });
      return Promise.resolve({ id: data.id });
    },
    findUnique: ({ where }: { where: { tokenHash: string } }) =>
      Promise.resolve(rows.find((r) => r.tokenHash === where.tokenHash) ?? null),
    updateMany: ({
      where,
      data,
    }: {
      where: { id?: string; familyId?: string; userId?: string; revokedAt?: null };
      data: { revokedAt: Date };
    }) => {
      const target = rows.filter(
        (r) =>
          (where.id === undefined || r.id === where.id) &&
          (where.familyId === undefined || r.familyId === where.familyId) &&
          (where.userId === undefined || r.userId === where.userId) &&
          (where.revokedAt !== null || r.revokedAt === null),
      );
      for (const r of target) r.revokedAt = data.revokedAt;
      return Promise.resolve({ count: target.length });
    },
    count: ({ where }: { where: { familyId?: string; revokedAt?: null } }) =>
      Promise.resolve(
        rows.filter(
          (r) =>
            (where.familyId === undefined || r.familyId === where.familyId) &&
            (where.revokedAt !== null || r.revokedAt === null),
        ).length,
      ),
  };

  return {
    rows,
    /** Sebar ke objek PrismaClient palsu milik masing-masing file test. */
    prismaPart: {
      refreshToken,
      // Transaksi palsu: jalankan callback dengan klien yang sama. Cukup untuk
      // membuktikan alur endpoint; atomisitasnya diuji di test DB nyata.
      $transaction: <T>(fn: (tx: { refreshToken: typeof refreshToken }) => Promise<T>) =>
        fn({ refreshToken }),
    },
  };
}
