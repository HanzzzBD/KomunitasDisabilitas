// modules/users — preferensi kanal notifikasi (PR-049b).
//
// KENAPA DI MODUL `users` DAN BUKAN DI `notifications`. Kolomnya
// (`users.notification_prefs`, migrasi 15) ada di tabel yang dimiliki modul ini,
// dan endpoint-nya `/me/notification-prefs` — tetangga `/me` dan `/me/export`,
// bukan tetangga `/me/notifications`. Modul `notifications` MEMBACA preferensi
// ini lewat parameter yang disuntik di composition root, pola yang sama dengan
// `accessibility` pada jalur push (PR-048b) dan `penerima` pada jalur email
// (PR-049a). Meng-import repository-nya lintas modul adalah yang dilarang
// aturan boundaries PR-002, bukan membaca preferensinya.
//
// `null` PADA SEBUAH KANAL BERARTI "BELUM PERNAH MEMILIH", bukan "memilih
// bawaan" — dan itu bukan kehalusan tipe. Bawaan yang dituliskan ke baris
// membuat perubahan kebijakan bawaan di kemudian hari tidak pernah menjangkau
// siapa pun yang tidak pernah memilih apa-apa. Pelajaran yang sama sudah dibayar
// mahal pada preferensi aksesibilitas (PR-036R, migrasi 09), tempat `@default`
// pada kolom membuat sinyal OS pengguna padam diam-diam saat ia masuk.
import {
  notificationChannelPrefsSchema,
  NOTIFICATION_CHANNEL_PREFS_KOSONG,
  type NotificationChannelPrefs,
  type UpdateNotificationChannelPrefs,
} from "@nawasena/schemas";
import { appError } from "../../../core/http/index.js";
import type { UserProfileRepository } from "../repositories/user.repository.js";

export interface NotificationPrefsActor {
  userId: string;
  requestId: string;
}

export interface NotificationPrefsServiceDeps {
  userRepository: Pick<
    UserProfileRepository,
    "findNotificationPrefs" | "updateNotificationPrefs"
  >;
}

/**
 * Urai kolom jsonb tanpa mempercayai bentuknya.
 *
 * DB tidak menegakkan apa pun pada `Json?`, jadi baris yang ditulis versi kode
 * lain — atau tangan operator — bisa berbentuk apa saja. Bentuk yang tidak
 * dikenali diperlakukan sebagai "belum memilih": itu jatuh ke bawaan, dan bawaan
 * email adalah MATI. Bentuk rusak tidak boleh menjadi jalan mengirimi orang
 * email yang tidak pernah ia minta.
 */
export function uraiPrefs(nilai: unknown): NotificationChannelPrefs {
  const hasil = notificationChannelPrefsSchema.safeParse(nilai);
  return hasil.success ? hasil.data : { ...NOTIFICATION_CHANNEL_PREFS_KOSONG };
}

export function createNotificationPrefsService(deps: NotificationPrefsServiceDeps) {
  const { userRepository } = deps;

  return {
    /**
     * GET /me/notification-prefs — preferensi TERSIMPAN, `null` dipertahankan.
     *
     * Yang dijawab BUKAN kanal yang berlaku. Klien menghitungnya sendiri lewat
     * `kanalBerlaku()` dari `@nawasena/schemas` — fungsi yang sama dengan yang
     * dipakai server sebelum mengantre. Menjawab hasil resolusi akan membuat
     * "belum memilih" tidak punya bentuk di kabel, dan toggle tidak bisa lagi
     * membedakan "saya menyalakannya" dari "kebetulan bawaannya menyala".
     */
    async getMe(actor: NotificationPrefsActor): Promise<NotificationChannelPrefs> {
      const row = await userRepository.findNotificationPrefs(actor.userId);
      // requireAuth sudah menolak akun tidak aktif; ketiadaan baris di sini
      // berarti akun dihapus di antara guard dan query ini.
      if (row === null) throw appError("SESI_TIDAK_VALID");
      return uraiPrefs(row.prefs);
    },

    /**
     * PUT /me/notification-prefs — perubahan sebagian.
     *
     * Baca-lalu-tulis, dan balapannya diakui apa adanya: dua permintaan
     * bersamaan atas kanal BERBEDA bisa membuat yang belakangan menimpa yang
     * duluan. Tidak dikunci karena kedua penulisnya adalah orang yang SAMA di
     * layar yang sama — satu-satunya jalan tulis ke kolom ini adalah endpoint
     * ini, dengan `userId` dari sesi. Biaya `SELECT … FOR UPDATE` pada tabel
     * terbesar sistem ini tidak sebanding dengan balapan yang menuntut seseorang
     * menekan dua toggle di dua tab pada milidetik yang sama.
     *
     * `null` pada sebuah kanal adalah PERINTAH HAPUS: ia mengembalikan kanal itu
     * ke "belum memilih" sehingga bawaan bisa berlaku lagi.
     */
    async updateMe(
      actor: NotificationPrefsActor,
      patch: UpdateNotificationChannelPrefs,
    ): Promise<NotificationChannelPrefs> {
      const row = await userRepository.findNotificationPrefs(actor.userId);
      if (row === null) throw appError("SESI_TIDAK_VALID");

      const sebelum = uraiPrefs(row.prefs);
      // Field yang TIDAK disebut tidak berubah; yang disebut `null` menjadi
      // "belum memilih". Keduanya perlu dibedakan, jadi `in` — bukan
      // `patch.email !== undefined`, yang menyamakan "tidak disebut" dengan
      // "disebut sebagai undefined".
      const sesudah: NotificationChannelPrefs = {
        email: "email" in patch ? (patch.email ?? null) : sebelum.email,
        push: "push" in patch ? (patch.push ?? null) : sebelum.push,
      };

      const hasil = await userRepository.updateNotificationPrefs(actor.userId, sesudah);
      if (hasil === null) throw appError("SESI_TIDAK_VALID");
      return uraiPrefs(hasil.prefs);
    },

    /**
     * Pembacaan untuk PRODUSER job email (PR-049b), bukan untuk HTTP.
     *
     * Dipisahkan dari `getMe` karena bentuk kegagalannya berbeda: `getMe`
     * melempar bila akunnya hilang (permintaan HTTP memang harus gagal), sedang
     * pemanggil ini adalah pelanggan event yang pekerjaan utamanya sudah selesai
     * — kabar yang tidak jadi diantre tidak boleh menjatuhkannya. Akun yang
     * tidak ditemukan di sini menjawab "belum memilih", yang berarti email mati.
     */
    async untukProduser(userId: string): Promise<NotificationChannelPrefs> {
      const row = await userRepository.findNotificationPrefs(userId);
      return row === null ? { ...NOTIFICATION_CHANNEL_PREFS_KOSONG } : uraiPrefs(row.prefs);
    },
  };
}

export type NotificationPrefsService = ReturnType<typeof createNotificationPrefsService>;
