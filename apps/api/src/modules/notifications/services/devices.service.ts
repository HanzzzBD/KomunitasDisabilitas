// modules/notifications — service pendaftaran perangkat push (PR-048a).
//
// Aturan yang mengikat seluruh berkas, sama dengan service notifikasi: `userId`
// SELALU datang dari sesi, tidak pernah dari input. Tidak ada parameter untuk
// menyebut pengguna lain.
//
// PR-094 menambahkan pelepasan perangkat saat logout mobile. Token mati tetap
// dibersihkan PR-048b; penghapusan akun tetap membawa perangkat lewat cascade.
import type { Device, RegisterDevice } from "@nawasena/schemas";
import { uuidV7 } from "../../../core/ids/index.js";
import type { DeviceRepository, DeviceRow } from "../repositories/devices.repository.js";

/** Konteks pemanggil — bentuknya sama dengan `NotificationsActor` (PR-047). */
export interface DevicesActor {
  userId: string;
  requestId: string;
}

export interface DevicesServiceDeps {
  deviceRepository: DeviceRepository;
}

/**
 * Baris DB → kontrak API. Pemetaan eksplisit, dan di sini ia punya tugas kedua
 * di luar kerapian: `fcmToken` dan `userId` TIDAK punya jalan keluar dari sini.
 * Spread akan mengirim keduanya ke klien pada hari seseorang menambah kolom.
 */
function kePerangkat(row: DeviceRow): Device {
  return {
    id: row.id,
    platform: row.platform as Device["platform"],
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function createDevicesService(deps: DevicesServiceDeps) {
  const { deviceRepository } = deps;

  return {
    /** PR-094: logout mobile, identitas tetap berasal dari sesi. */
    async unregister(actor: DevicesActor, id: string): Promise<void> {
      await deviceRepository.hapusMilik(actor.userId, id);
    },
    /**
     * POST /me/devices — daftarkan perangkat pemilik sesi.
     *
     * IDEMPOTEN, dan harus begitu: klien FCM memanggil ini pada setiap peluncuran
     * aplikasi, bukan sekali seumur pemasangan. Pemanggilan kedua dengan token
     * yang sama hanya menggeser `lastSeenAt` — bukan melahirkan baris kedua, dan
     * bukan pula error yang harus ditangani klien atas keadaan yang normal.
     */
    async register(actor: DevicesActor, input: RegisterDevice): Promise<Device> {
      const row = await deviceRepository.daftarkan({
        // Id dibuat di aplikasi (uuidV7, SDD §14). Bila barisnya ternyata sudah
        // ada, id ini dibuang oleh `upsert` — yang benar: id baris tidak boleh
        // berubah hanya karena pemiliknya mendaftar ulang.
        id: uuidV7(),
        userId: actor.userId,
        fcmToken: input.fcmToken,
        platform: input.platform,
      });
      return kePerangkat(row);
    },

    /**
     * Perangkat milik seorang pengguna — sasaran push (PR-048b).
     *
     * TIDAK punya endpoint. Dikembalikan sebagai service supaya jalur pengiriman
     * membacanya lewat pintu yang sama dengan pendaftarannya, bukan lewat
     * repository yang di-import langsung lintas modul (larangan PR-002).
     */
    async milik(userId: string): Promise<DeviceRow[]> {
      return deviceRepository.byUserId(userId);
    },

    /**
     * Hapus perangkat karena FCM menyatakan tokennya sudah tidak terdaftar
     * (PR-048b). TIDAK punya endpoint, dan tidak boleh punya: keputusannya milik
     * FCM, bukan milik siapa pun yang bisa memanggil API.
     *
     * Tanpa `userId` dengan sengaja — lihat alasannya di repository.
     */
    async hapusToken(fcmToken: string): Promise<boolean> {
      return deviceRepository.hapusByToken(fcmToken);
    },
  };
}

export type DevicesService = ReturnType<typeof createDevicesService>;
