// Sakelar operasional feed matching (PR-074) — Rollback Strategy ticket:
// "fallback beranda = browse (PR-058) via flag".
//
// Pola SAMA dengan `features/onboarding/bendera.ts`: satu fungsi, nama
// variabelnya ditulis SEKALI, dibaca dari `import.meta.env` (dipanggang saat
// build). Polaritasnya: yang MEMATIKAN harus menyatakannya (`"false"`).

/** Feed matching tampil di beranda seeker? BAWAANNYA YA. */
export function feedMatchingAktif(): boolean {
  return import.meta.env.VITE_MATCHING_FEED_ENABLED !== "false";
}
