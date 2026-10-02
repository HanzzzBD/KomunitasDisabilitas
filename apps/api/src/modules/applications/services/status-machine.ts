// modules/applications — mesin status lamaran (PR-076, PRD FR-5.3).
//
// SATU-SATUNYA tempat yang menjawab "boleh pindah dari X ke Y oleh siapa?".
// Fungsi murni tanpa I/O supaya seluruh tabelnya bisa diuji habis (AC "test
// state machine penuh") dan dipakai ulang jalur admin PR-077 tanpa salinan.
//
// ATURAN (keputusan owner 2026-10-02):
//   1. Maju boleh LONCAT di sepanjang ALUR (submitted → … → hired).
//   2. Mundur DILARANG.
//   3. `hired`, `rejected`, `withdrawn` adalah AKHIR — tidak bisa diubah.
//   4. Pelamar hanya boleh `withdraw` dari status aktif mana pun. Konfirmasi
//      diterima (offered → hired) adalah aksi tersendiri, bukan transisi bebas.
//   5. Admin boleh semua langkah maju + `rejected`, tetapi TIDAK `withdrawn`:
//      membatalkan lamaran adalah keputusan pelamar, bukan operator.
import type { ApplicationStatus } from "@nawasena/schemas";

/** Urutan maju pipeline. `rejected`/`withdrawn` di luar alur — keduanya akhir. */
export const ALUR_STATUS = [
  "submitted",
  "viewed",
  "in_review",
  "interview",
  "offered",
  "hired",
] as const satisfies readonly ApplicationStatus[];

export const STATUS_AKHIR: ReadonlySet<ApplicationStatus> = new Set([
  "hired",
  "rejected",
  "withdrawn",
]);

export type PeranPemindah = "seeker" | "admin";

export function statusAktif(status: ApplicationStatus): boolean {
  return !STATUS_AKHIR.has(status);
}

function posisi(status: ApplicationStatus): number {
  return (ALUR_STATUS as readonly ApplicationStatus[]).indexOf(status);
}

/** Apakah `peran` boleh memindahkan lamaran dari `dari` ke `ke`. */
export function bolehPindah(
  dari: ApplicationStatus,
  ke: ApplicationStatus,
  peran: PeranPemindah,
): boolean {
  if (!statusAktif(dari) || dari === ke) return false;

  if (peran === "seeker") return ke === "withdrawn";

  if (ke === "withdrawn") return false;
  if (ke === "rejected") return true;
  return posisi(ke) > posisi(dari);
}
