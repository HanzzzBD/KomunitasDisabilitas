// modules/notifications — repository (PR-047). Satu-satunya lapisan yang
// menyentuh Prisma; service di atasnya tidak mengenal nama kolom DB.
//
// SETIAP QUERY DI SINI MENYEBUT `userId`, TANPA KECUALI — termasuk yang sudah
// menyebut `id` primer. Alasannya sama dengan `career.repository.ts`: dengan
// `userId` di dalam `where`, notifikasi milik orang lain berperilaku seperti
// baris yang tidak ada, dan kepemilikan bukan pemeriksaan terpisah yang bisa
// lupa dipasang di service.
import type { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";

/**
 * Isi kolom `payload` (JSONB) seperti dilihat lapisan di ATAS repository.
 *
 * Sengaja BUKAN `Prisma.InputJsonObject`: tipe itu milik Prisma, dan service
 * yang harus menyebutnya akan ikut meng-import `@prisma/client` — persis
 * kebocoran lapisan yang dijaga aturan boundaries (CLAUDE.md §3.2). Nilainya
 * dipersempit ke skalar JSON karena katalog parameter memang hanya meloloskan
 * id dan enum (NOTIFICATION_PARAM_SCHEMAS).
 */
export type PayloadNotifikasi = Record<string, string | number | boolean>;

/** Baris `notifications` apa adanya. */
export interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

/** Satu notifikasi yang akan ditulis; `id` SUDAH diturunkan pemanggil. */
export interface NotificationBaru {
  id: string;
  userId: string;
  type: string;
  payload: PayloadNotifikasi;
}

/**
 * Posisi halaman. Dua komponen, bukan satu: `createdAt` saja tidak menentukan
 * urutan bila dua notifikasi lahir pada milidetik yang sama — dan itu justru
 * yang terjadi saat satu peristiwa melahirkan beberapa notifikasi sekaligus.
 */
export interface KursorHalaman {
  createdAt: Date;
  id: string;
}

export interface OpsiDaftar {
  userId: string;
  /** Jumlah baris yang diminta; repository mengambil ini apa adanya. */
  limit: number;
  /** Ambil hanya yang belum dibaca. */
  unreadOnly: boolean;
  /** Mulai SESUDAH posisi ini; `undefined` = halaman pertama. */
  setelah?: KursorHalaman;
}

export interface NotificationRepository {
  /**
   * Tulis banyak notifikasi sekaligus; yang id-nya sudah ada DILEWATI.
   * Kembaliannya jumlah baris yang benar-benar lahir.
   */
  createMany(items: NotificationBaru[]): Promise<number>;
  list(opsi: OpsiDaftar): Promise<NotificationRow[]>;
  /**
   * SELURUH notifikasi milik seorang pengguna, tanpa halaman — hanya untuk
   * ekspor PDP (U-04). Sengaja dipisahkan dari `list`: yang tak berbatas tidak
   * boleh bisa dipanggil tanpa sengaja dari jalur yang melayani permintaan HTTP
   * biasa, dan nama yang menyebut tujuannya membuat setiap pemakaian baru
   * terbaca sebagai keputusan.
   */
  semuaByUserId(userId: string): Promise<NotificationRow[]>;
  /** Jumlah SELURUH yang belum dibaca — tidak terpengaruh halaman. */
  unreadCount(userId: string): Promise<number>;
  /** Tandai dibaca; `null` bila baris tidak ada ATAU bukan milik `userId`. */
  markRead(userId: string, id: string, saat: Date): Promise<NotificationRow | null>;
  findById(userId: string, id: string): Promise<NotificationRow | null>;
}

export function createNotificationRepository(prisma: AppPrisma): NotificationRepository {
  return {
    async createMany(items) {
      if (items.length === 0) return 0;
      // `skipDuplicates` = ON CONFLICT DO NOTHING pada kunci primer. INILAH
      // penjaga idempotensinya, dan ia ada di DB dengan sengaja: "cek dulu lalu
      // tulis" di aplikasi kalah balapan dengan salinan dirinya sendiri di
      // replika kedua, sedangkan kunci primer tidak pernah kalah.
      const hasil = await prisma.notification.createMany({
        // Cast tunggal di BATASNYA, tempat Prisma memang berkuasa: nilai yang
        // masuk sudah dipersempit ke skalar JSON oleh `PayloadNotifikasi`.
        data: items.map((item) => ({ ...item, payload: item.payload as Prisma.InputJsonObject })),
        skipDuplicates: true,
      });
      return hasil.count;
    },

    list({ userId, limit, unreadOnly, setelah }) {
      return prisma.notification.findMany({
        where: {
          userId,
          ...(unreadOnly ? { readAt: null } : {}),
          // Keyset, bukan OFFSET: "terbaru dulu" yang memakai OFFSET akan
          // menggeser seluruh halaman berikutnya setiap kali satu notifikasi
          // baru lahir, sehingga pengguna melihat item yang sama dua kali dan
          // melewatkan yang lain. Perbandingan leksikografis (createdAt, id)
          // tidak bergeser: ia menyebut POSISI, bukan jarak dari awal.
          ...(setelah === undefined
            ? {}
            : {
                OR: [
                  { createdAt: { lt: setelah.createdAt } },
                  { createdAt: setelah.createdAt, id: { lt: setelah.id } },
                ],
              }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      });
    },

    semuaByUserId(userId) {
      return prisma.notification.findMany({
        where: { userId },
        // Urutan yang sama dengan yang dilihat pengguna di layar.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    },

    unreadCount(userId) {
      // Bentuk query ini TIDAK BOLEH berubah tanpa memeriksa ulang rencananya:
      // `user_id = ? AND read_at IS NULL` persis mencocoki indeks parsial
      // `notifications_unread` (migrasi 03), dan itulah yang membuat lencana
      // tetap murah bagi pengguna dengan ribuan notifikasi terbaca.
      // Dijaga `notifications-db.test.ts` lewat EXPLAIN.
      return prisma.notification.count({ where: { userId, readAt: null } });
    },

    async markRead(userId, id, saat) {
      // `updateMany` + `userId` di dalam `where`, BUKAN `update` ber-id primer:
      // `update` yang tidak menemukan barisnya melempar P2025, dan membedakan
      // "tidak ada" dari "milik orang lain" lewat error Prisma adalah cara
      // membocorkan keberadaan baris orang lain.
      //
      // `readAt: null` ikut disyaratkan agar penandaan kedua tidak menggeser
      // waktu baca yang sudah tercatat — tetapi itu berarti `count: 0` bisa
      // berarti "sudah dibaca", jadi jawabannya dibaca ulang di bawah.
      await prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: saat },
      });
      return prisma.notification.findFirst({ where: { id, userId } });
    },

    findById(userId, id) {
      return prisma.notification.findFirst({ where: { id, userId } });
    },
  };
}
