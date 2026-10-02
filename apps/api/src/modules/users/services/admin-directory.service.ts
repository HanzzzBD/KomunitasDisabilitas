// modules/users — direktori admin (PR-075).
//
// Satu-satunya jawaban atas "siapa admin aktif saat ini?" bagi modul lain. Modul
// `notifications` membutuhkannya untuk kabar `admin.lamaran_baru`, dan kolom
// `role` milik modul ini — jadi jawabannya lewat service di sini, diserahkan di
// composition root, bukan lewat query `users` yang ditulis di modul lain.
import type { UserProfileRepository } from "../repositories/user.repository.js";

export function createAdminDirectory(
  userRepository: Pick<UserProfileRepository, "listActiveAdminIds">,
) {
  return {
    /** Akun ber-role admin yang belum dihapus. Kosong = tidak ada yang dikabari. */
    idAdminAktif(): Promise<string[]> {
      return userRepository.listActiveAdminIds();
    },
  };
}

export type AdminDirectory = ReturnType<typeof createAdminDirectory>;

/**
 * Identitas pelamar bagi jalur admin lamaran (PR-077a, keputusan owner
 * 2026-10-02: nama + kontak + CV). Kolom `full_name`/`phone`/`email` milik
 * modul ini, jadi bacaannya lewat sini — bukan query `users` di modul
 * applications. TIDAK pernah menyentuh data disabilitas.
 */
export function createApplicantDirectory(
  userRepository: Pick<UserProfileRepository, "listIdentityByIds">,
) {
  return {
    identitas(ids: readonly string[]) {
      return userRepository.listIdentityByIds(ids);
    },
  };
}

export type ApplicantDirectory = ReturnType<typeof createApplicantDirectory>;
