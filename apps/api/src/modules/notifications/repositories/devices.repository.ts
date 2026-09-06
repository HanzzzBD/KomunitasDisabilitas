// modules/notifications — repository perangkat push (PR-048a).
//
// Terpisah dari `notifications.repository.ts` meski satu modul: keduanya tidak
// pernah dipakai bersama dalam satu operasi, dan repository yang menggabungkan
// dua agregat berbeda adalah repository yang setiap konsumennya membawa separuh
// yang tidak ia butuhkan.
//
// ATURAN YANG SAMA DENGAN REPOSITORY NOTIFIKASI: setiap query yang membaca atau
// menghapus atas nama seorang pengguna menyebut `userId`. Satu-satunya
// pengecualian ditandai eksplisit di tempatnya — penghapusan token mati oleh
// processor push, yang memang bekerja atas nama sistem, bukan atas nama sesi.
import type { AppPrisma } from "../../../core/db/index.js";

/** Baris `devices` apa adanya. */
export interface DeviceRow {
  id: string;
  userId: string;
  fcmToken: string;
  platform: string;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface DaftarPerangkat {
  id: string;
  userId: string;
  fcmToken: string;
  platform: string;
}

export interface DeviceRepository {
  /**
   * Daftarkan perangkat, atau perbarui yang sudah ada.
   *
   * Kuncinya `fcmToken` (unik global), BUKAN pasangan (userId, fcmToken) —
   * lihat alasannya di schema.prisma. Akibatnya yang disengaja: perangkat yang
   * sebelumnya milik orang lain BERPINDAH kepemilikan, tidak menggandakan diri.
   */
  daftarkan(input: DaftarPerangkat): Promise<DeviceRow>;
  /** Seluruh perangkat milik seorang pengguna — sasaran push. */
  byUserId(userId: string): Promise<DeviceRow[]>;
  /**
   * Hapus satu perangkat berdasarkan tokennya. Dipakai processor push saat FCM
   * menyatakan token sudah tidak terdaftar.
   */
  hapusByToken(fcmToken: string): Promise<boolean>;
}

export function createDeviceRepository(prisma: AppPrisma): DeviceRepository {
  return {
    daftarkan({ id, userId, fcmToken, platform }) {
      // `upsert` satu statement, bukan "cari lalu tulis": dua peluncuran aplikasi
      // yang hampir bersamaan (mis. klien mencoba ulang karena jaringan lambat)
      // akan sama-sama lolos pemeriksaan baca sebelum salah satunya menulis, lalu
      // yang kedua gagal P2002 atas token yang sah. Upsert menyerahkan
      // penyelesaiannya ke DB, tempat balapan itu tidak ada.
      return prisma.device.upsert({
        where: { fcmToken },
        create: { id, userId, fcmToken, platform: platform as never },
        // `userId` IKUT diperbarui — inilah perpindahan kepemilikannya.
        // `createdAt` tidak: ia menyatakan kapan perangkatnya pertama dikenal,
        // dan itu tidak berubah hanya karena penggunanya berganti.
        update: { userId, platform: platform as never, lastSeenAt: new Date() },
      });
    },

    byUserId(userId) {
      return prisma.device.findMany({
        where: { userId },
        // Terbaru menyapa lebih dulu. Bukan kosmetik: bila kelak ada batas
        // jumlah perangkat per pengguna, yang dipotong harus yang paling lama
        // tidak terpakai — bukan yang kebetulan berada di akhir daftar.
        orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      });
    },

    async hapusByToken(fcmToken) {
      // TANPA `userId`, dan ini pengecualian yang disebut di kepala berkas.
      // Pemanggilnya adalah processor push yang baru saja diberi tahu FCM bahwa
      // token ini mati; ia bekerja atas nama sistem. Menuntut `userId` di sini
      // akan membuat token yang sudah berpindah pemilik — persis keadaan yang
      // paling sering menghasilkan `UNREGISTERED` — luput dari pembersihan.
      const { count } = await prisma.device.deleteMany({ where: { fcmToken } });
      return count > 0;
    },
  };
}
