// modules/users — moderasi akun oleh admin (PR-083, FR-6.2).
//
// Ditangguhkan ≠ dihapus: tidak ada data yang disentuh selain dua kolom
// status. Penulisan CAS (`suspendedAt: null` / `{ not: null }` di WHERE):
// dua admin yang menekan bersamaan tidak saling menimpa alasan — yang kalah
// mendapat `null` dan menjawab 409.
import { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";

export interface AdminUserRow {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: "seeker" | "employer" | "admin";
  createdAt: Date;
  suspendedAt: Date | null;
  suspendReason: string | null;
}

const KOLOM = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  role: true,
  createdAt: true,
  suspendedAt: true,
  suspendReason: true,
} as const;

const RECORD_NOT_FOUND = "P2025";

export function createModerationRepository(prisma: AppPrisma) {
  return {
    /** Akun aktif (belum dihapus), terbaru daftar dulu, keyset `(created_at, id)`. */
    async list(
      filter: { q?: string; status?: "aktif" | "ditangguhkan" },
      limit: number,
      setelah?: { createdAt: Date; id: string },
    ): Promise<AdminUserRow[]> {
      const cari = filter.q;
      return prisma.user.findMany({
        where: {
          deletedAt: null,
          ...(filter.status === "aktif" ? { suspendedAt: null } : {}),
          ...(filter.status === "ditangguhkan" ? { suspendedAt: { not: null } } : {}),
          ...(cari === undefined
            ? {}
            : {
                OR: [
                  { fullName: { contains: cari, mode: "insensitive" } },
                  { phone: { contains: cari } },
                  { email: { contains: cari, mode: "insensitive" } },
                ],
              }),
          ...(setelah === undefined
            ? {}
            : {
                AND: [
                  {
                    OR: [
                      { createdAt: { lt: setelah.createdAt } },
                      { createdAt: setelah.createdAt, id: { lt: setelah.id } },
                    ],
                  },
                ],
              }),
        },
        select: KOLOM,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      });
    },

    async findActive(id: string): Promise<AdminUserRow | null> {
      return prisma.user.findFirst({ where: { id, deletedAt: null }, select: KOLOM });
    },

    /** null = bukan seeker aktif yang belum ditangguhkan (pemanggil membedakan sebabnya). */
    async suspend(id: string, reason: string, at: Date): Promise<AdminUserRow | null> {
      try {
        return await prisma.user.update({
          where: { id, deletedAt: null, role: "seeker", suspendedAt: null },
          data: { suspendedAt: at, suspendReason: reason },
          select: KOLOM,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === RECORD_NOT_FOUND) {
          return null;
        }
        throw err;
      }
    },

    async unsuspend(id: string): Promise<AdminUserRow | null> {
      try {
        return await prisma.user.update({
          where: { id, deletedAt: null, suspendedAt: { not: null } },
          data: { suspendedAt: null, suspendReason: null },
          select: KOLOM,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === RECORD_NOT_FOUND) {
          return null;
        }
        throw err;
      }
    },
  };
}

export type ModerationRepository = ReturnType<typeof createModerationRepository>;
