// modules/accessibility — kontributor ekspor PDP (utang U-03, dibayar 2026-09-05).
//
// KENAPA BARU SEKARANG, DAN KENAPA ITU BUKAN PENUNDAAN YANG SAH. Saat modul ini
// lahir (PR-034), penjaga ekspor menempatkan `accessibility_profiles` di DITUNDA
// dengan alasan yang berlaku bagi seluruh daftar itu: "belum ada endpoint yang
// bisa mengisinya". Alasan itu berhenti benar pada hari PR-034 sendiri merged —
// `/me/accessibility` melayani baca-tulis, dan sejak itu SETIAP akun baru
// otomatis mendapat barisnya lewat pelanggan `auth.user_registered`.
//
// Yang tersisa setelahnya bukan penundaan melainkan kekurangan: selama lima
// phase, orang yang memakai haknya mengunduh data pribadi menerima berkas tanpa
// preferensi aksesibilitasnya — pilihan yang ia buat sendiri, tentang
// disabilitasnya. Persis kegagalan yang diperingatkan kepala
// `export-kelengkapan.test.ts`: endpoint tetap 200, test tetap hijau, dan
// pengguna menerima berkas yang kurang tanpa satu pun cara mengetahuinya.
//
// Ditemukan lewat rekonsiliasi utang 2026-09-05, bukan lewat laporan pengguna.
import type { AccessibilityProfile } from "@nawasena/schemas";
// Impor LINTAS MODUL yang sah: service → service (aturan boundaries PR-002).
import type { ExportContributor } from "../../users/services/export.service.js";
import type { AccessibilityService } from "./accessibility.service.js";

export interface AccessibilityExportDeps {
  /**
   * Service yang SAMA dengan yang melayani `/me/accessibility` — bukan salinan
   * kedua. Ekspor yang membaca lewat jalur berbeda adalah ekspor yang bisa
   * menyimpang dari apa yang dilihat pemiliknya di layar, dan tidak ada test
   * yang akan menangkap perbedaan itu sampai seseorang membandingkan keduanya.
   */
  accessibility: Pick<AccessibilityService, "getMe">;
}

export function createAccessibilityExportContributor(
  deps: AccessibilityExportDeps,
): ExportContributor {
  return {
    bagian: "accessibility",
    async kumpulkan(userId): Promise<AccessibilityProfile> {
      // `getMe` menuntut aktor ber-requestId karena ia berbagi bentuk dengan
      // jalur HTTP. Di sini pemanggilnya adalah agregator ekspor, yang sudah
      // memegang requestId-nya sendiri — tetapi meneruskannya menuntut mengubah
      // tanda tangan `ExportContributor` untuk satu-satunya pemakai yang
      // membutuhkannya. Yang dikirim karena itu penanda asal, bukan requestId
      // palsu yang bisa disalahartikan sebagai permintaan HTTP di log.
      //
      // Aman karena `getMe` TIDAK menulis apa pun dan tidak pernah menyentuh
      // audit: satu-satunya yang dilakukannya dengan requestId adalah
      // meneruskannya, dan di sini tidak ada yang menerimanya.
      return deps.accessibility.getMe({ userId, requestId: "ekspor-pdp" });
    },
  };
}
