// modules/notifications — service (PR-047, PRD FR-5.4).
//
// ATURAN YANG MENGIKAT SELURUH FILE, sama dengan `modules/accessibility`:
// `userId` untuk jalur BACA selalu datang dari sesi, tidak pernah dari input.
// Tidak ada parameter untuk menyebut pengguna lain — bukan pemeriksaan yang
// bisa lupa dipasang, melainkan saluran yang tidak ada.
//
// Jalur TULIS berbeda dan memang harus berbeda: notifikasi lahir dari peristiwa
// yang menyebut penerimanya (`payload.userId` sebuah event domain), bukan dari
// permintaan HTTP. Karena itu `terbitkan()` tidak punya endpoint sama sekali —
// satu-satunya pemanggilnya adalah pelanggan event di `index.ts`.
import {
  NOTIFICATION_PARAM_SCHEMAS,
  type Notification,
  type NotificationParams,
  type NotificationType,
} from "@nawasena/schemas";
import { uuidV5 } from "../../../core/ids/index.js";
import type {
  NotificationRepository,
  NotificationRow,
  PayloadNotifikasi,
} from "../repositories/notifications.repository.js";
import { decodeKursor, encodeKursor } from "./kursor.js";
import { renderNotifikasi } from "./template.service.js";

/** Konteks pemanggil — bentuknya sama dengan `AccessibilityActor` (PR-034). */
export interface NotificationsActor {
  userId: string;
  requestId: string;
}

export interface TerbitkanOpsi<T extends NotificationType> {
  /** Penerima. Datang dari payload event, bukan dari sesi siapa pun. */
  userId: string;
  type: T;
  params: NotificationParams<T>;
  /**
   * Penanda peristiwa yang melahirkan notifikasi ini — biasanya sebuah id
   * (`applicationId`) digabung nilai yang membedakan langkahnya (`status`).
   *
   * INI YANG MEMBUAT IDEMPOTEN. `id` baris diturunkan darinya (uuidV5), jadi
   * peristiwa yang sama menghasilkan id yang sama, dan kunci primer menolak
   * yang kedua. Dua kali `emit` untuk perpindahan status yang sama karena itu
   * berakhir sebagai SATU baris, bukan dua kabar berturut-turut kepada
   * pengguna yang tidak melakukan apa-apa.
   */
  kunciPeristiwa: string;
}

export interface DaftarOpsi {
  limit: number;
  unreadOnly: boolean;
  cursor?: string;
}

export interface HasilDaftar {
  data: Notification[];
  meta: { nextCursor: string | null; unreadCount: number };
}

export interface NotificationsServiceDeps {
  notificationRepository: NotificationRepository;
  /** Jam diinjeksi agar `readAt` bisa diuji tanpa menunggu waktu nyata. */
  clock?: () => Date;
}

/** Baris tidak ada — atau milik orang lain, yang bagi pemanggil sama saja. */
export class NotifikasiTidakDitemukanError extends Error {
  constructor() {
    super("Notifikasi tidak ditemukan");
    this.name = "NotifikasiTidakDitemukanError";
  }
}

/**
 * Id baris = uuidV5 atas `<type>:<userId>:<kunciPeristiwa>`.
 *
 * `userId` IKUT DIHITUNG meski peristiwanya sudah unik. Tanpa itu, satu
 * peristiwa yang kelak memberitahu dua orang (pelamar dan perekrut, Phase 08)
 * akan menghasilkan id yang sama untuk keduanya — dan yang kedua ditolak
 * sebagai "duplikat" lalu tidak pernah dikirim.
 */
export function idNotifikasi(type: string, userId: string, kunciPeristiwa: string): string {
  return uuidV5(`${type}:${userId}:${kunciPeristiwa}`);
}

/**
 * Baris DB → kontrak API. Pemetaan eksplisit, bukan spread: `userId` tidak
 * punya jalan keluar dari sini, dan kolom yang kelak ditambahkan ke tabel tidak
 * ikut bocor ke response hanya karena tidak ada yang mengubah file ini.
 */
function keNotifikasi(row: NotificationRow): Notification {
  const type = row.type as NotificationType;
  // Payload dibaca lewat skemanya, bukan di-cast. Baris lama yang tipenya
  // sudah tidak dikenal, atau payload yang bentuknya menyimpang, akan gagal
  // di sini alih-alih merender kalimat dengan `undefined` di tengahnya.
  const skema = NOTIFICATION_PARAM_SCHEMAS[type];
  const params = skema.parse(row.payload ?? {}) as NotificationParams<NotificationType>;
  const teks = renderNotifikasi(type, params);

  return {
    id: row.id,
    type,
    title: teks.title,
    body: teks.body,
    params: params as Record<string, string>,
    readAt: row.readAt === null ? null : row.readAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function createNotificationsService(deps: NotificationsServiceDeps) {
  const { notificationRepository } = deps;
  const clock = deps.clock ?? (() => new Date());

  return {
    /**
     * Lahirkan notifikasi dari sebuah peristiwa. Kembaliannya `true` bila baris
     * benar-benar lahir, `false` bila peristiwanya sudah pernah tercatat.
     *
     * Parameter divalidasi lewat skemanya sebelum ditulis: payload yang
     * bentuknya salah akan gagal SEKARANG, saat masih bisa dilacak ke penerbit
     * event-nya, bukan berbulan-bulan kemudian saat seorang pengguna membuka
     * daftar notifikasinya.
     */
    async terbitkan<T extends NotificationType>(opsi: TerbitkanOpsi<T>): Promise<boolean> {
      // Di-cast SETELAH lolos skemanya, bukan sebelum: skema hanya meloloskan
      // string dan enum (lihat NOTIFICATION_PARAM_SCHEMAS), jadi hasilnya
      // memang selalu objek berskalar JSON.
      const params = NOTIFICATION_PARAM_SCHEMAS[opsi.type].parse(opsi.params) as PayloadNotifikasi;
      const lahir = await notificationRepository.createMany([
        {
          id: idNotifikasi(opsi.type, opsi.userId, opsi.kunciPeristiwa),
          userId: opsi.userId,
          type: opsi.type,
          payload: params,
        },
      ]);
      return lahir === 1;
    },

    /**
     * GET /me/notifications — halaman notifikasi sendiri, terbaru dulu.
     *
     * Mengambil `limit + 1` baris lalu membuang yang terakhir: itulah cara
     * mengetahui ada-tidaknya halaman berikutnya TANPA query hitung kedua. Bila
     * baris ke-(limit+1) tidak ada, `nextCursor` null — dan klien berhenti
     * menggulir tanpa pernah menerima halaman kosong.
     */
    async list(actor: NotificationsActor, opsi: DaftarOpsi): Promise<HasilDaftar> {
      const rows = await notificationRepository.list({
        userId: actor.userId,
        limit: opsi.limit + 1,
        unreadOnly: opsi.unreadOnly,
        setelah: opsi.cursor === undefined ? undefined : decodeKursor(opsi.cursor),
      });

      const adaLagi = rows.length > opsi.limit;
      const halaman = adaLagi ? rows.slice(0, opsi.limit) : rows;
      const terakhir = halaman.at(-1);

      return {
        data: halaman.map(keNotifikasi),
        meta: {
          nextCursor:
            adaLagi && terakhir !== undefined
              ? encodeKursor({ createdAt: terakhir.createdAt, id: terakhir.id })
              : null,
          // Dihitung SETELAH daftar diambil dan selalu atas seluruh baris —
          // bukan atas halaman ini. Lencana yang berubah angka saat pengguna
          // menggulir adalah lencana yang salah.
          unreadCount: await notificationRepository.unreadCount(actor.userId),
        },
      };
    },

    /**
     * POST /me/notifications/:id/read — tandai dibaca.
     *
     * IDEMPOTEN: menandai yang sudah dibaca tetap 200 dan TIDAK menggeser
     * `readAt` yang sudah tercatat. Klien yang mengirim ulang karena jaringan
     * putus tidak boleh mendapat error atas tindakan yang sudah berhasil.
     */
    async markRead(
      actor: NotificationsActor,
      id: string,
    ): Promise<{ data: Notification; meta: { unreadCount: number } }> {
      const row = await notificationRepository.markRead(actor.userId, id, clock());
      // null berarti baris tidak ada ATAU milik orang lain — keduanya dijawab
      // 404 yang sama persis. Jawaban yang berbeda adalah cara menjawab
      // pertanyaan "apakah notifikasi ini ada?" kepada orang yang tidak berhak
      // menanyakannya.
      if (row === null) throw new NotifikasiTidakDitemukanError();

      return {
        data: keNotifikasi(row),
        meta: { unreadCount: await notificationRepository.unreadCount(actor.userId) },
      };
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
