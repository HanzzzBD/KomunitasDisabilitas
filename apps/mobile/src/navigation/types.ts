// Daftar layar root. Bertambah per PR fitur (090+); tiap layar yang boleh dibuka
// dari luar juga harus ada di `PATH_DIIZINKAN` (deep-link.ts).
//
// Sejak PR-090 layar terbagi dua stack menurut status sesi (App.tsx): Masuk &
// Verifikasi hanya ada saat keluar, Beranda hanya saat masuk. Deep link ke
// layar yang tidak ada di stack aktif diabaikan React Navigation.
export type RootStackParamList = {
  Masuk: undefined;
  /** Nomor sudah ternormalisasi E.164; detik tunggu sebelum boleh kirim ulang. */
  Verifikasi: { phone: string; retryAfterSeconds: number };
  /** PR-091: hanya terdaftar saat masuk DAN wizard diperlukan. */
  Onboarding: undefined;
  Beranda: undefined;
};
