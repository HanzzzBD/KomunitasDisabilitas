// PELANGGARAN: service modul `jobs` mengimpor BARREL modul `users`.
//
// Terlihat lebih sopan daripada menunjuk repository-nya langsung, dan justru itu
// bahayanya: barrel modul `users` mengekspor ulang repository-nya, sehingga
// jalur ini — bila diizinkan — membuat repository modul lain terjangkau lewat
// pintu belakang. Antar-modul HANYA lewat lapisan service.
//
// Kasus regresi untuk penyetelan aturan `module-shared` (lihat boundaries.cjs).
import { usersRepository } from "../../users/index.js";

export const jobsService = {
  ownerName: () => usersRepository.me(),
};
