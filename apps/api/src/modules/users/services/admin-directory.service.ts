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
