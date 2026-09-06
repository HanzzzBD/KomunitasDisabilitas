// Ke mana sebuah notifikasi mengantar (PR-050, AC-4).
//
// FUNGSI INI HARI INI SELALU MENJAWAB `null`, DAN ITU BUKAN PEKERJAAN YANG
// BELUM SELESAI — ia jawaban yang benar untuk keadaan hari ini.
//
// AC-4 PR-050 berbunyi "navigasi dari notifikasi ke entitas terkait (lamaran)".
// Entitas itu BELUM PUNYA HALAMAN: modul `applications` lahir di Phase 12
// (PR-076/PR-078), dan sampai saat itu tidak ada route `/lamaran/:id` di
// `app/routes.ts`. Merender tautan ke alamat yang tidak ada berarti mengirim
// pengguna ke layar 404 dari sebuah kabar yang justru ingin ia tindak lanjuti —
// lebih buruk daripada tidak menawarkan tautan sama sekali, sebab ia mengubah
// "belum bisa" menjadi "rusak".
//
// Yang dibangun karena itu adalah SEAM-nya, bukan tautannya: seluruh jalur
// render sudah menangani "ada tautan" dan "tidak ada tautan", dan begitu
// halaman lamaran lahir, SATU fungsi ini berubah dan setiap notifikasi
// seketika bisa ditelusuri. Tanpa seam ini, PR Phase 12 harus menyentuh
// komponen daftar, test-nya, dan katalog teksnya sekaligus.
//
// `NOTIFICATION_TYPE`, BUKAN literal `"auth.selamat_datang"`: prefiks `auth.`
// bentrok dengan nama katalog i18n `auth`, dan penjaga `i18n-lazy.test.ts`
// memindai literal berpola itu untuk menentukan katalog yang wajib dimuat
// sebuah rute. Literalnya di sini akan memaksa halaman notification center
// mengunduh seluruh katalog `auth` yang tidak pernah ia sentuh. Alasan
// lengkapnya di `packages/schemas/src/notifications.ts`.
import { NOTIFICATION_TYPE, type Notification } from "@nawasena/schemas";

/**
 * Alamat tujuan sebuah notifikasi, atau `null` bila entitasnya belum punya
 * halaman.
 *
 * `switch` dengan pemeriksaan `never` di akhir: tipe notifikasi BARU tidak bisa
 * lahir tanpa seseorang memutuskan ke mana ia mengantar — `typecheck` merah,
 * bukan tautan yang diam-diam hilang dari satu tipe saja.
 */
export function tautanNotifikasi(notifikasi: Pick<Notification, "type" | "params">): string | null {
  switch (notifikasi.type) {
    case NOTIFICATION_TYPE.AUTH_SELAMAT_DATANG:
      // Sengaja tanpa tautan, dan ini SATU-SATUNYA tipe yang akan tetap begitu
      // sesudah Phase 12. Sambutan tidak menunjuk entitas apa pun; tautan ke
      // beranda hanya akan menjadi tautan yang tidak menambah apa-apa bagi
      // orang yang sudah berada di dalam aplikasi.
      return null;
    case NOTIFICATION_TYPE.LAMARAN_TERKIRIM:
    case NOTIFICATION_TYPE.LAMARAN_STATUS_BERUBAH:
      // Menunggu `/lamaran/:id` (Phase 12). Bentuk yang akan dipakai:
      //   return `/lamaran/${String(notifikasi.params.applicationId)}`;
      return null;
    default: {
      const takTerduga: never = notifikasi.type;
      throw new Error(`Tipe notifikasi tidak dikenal: ${String(takTerduga)}`);
    }
  }
}
