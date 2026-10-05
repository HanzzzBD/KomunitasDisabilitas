// Daftar layar root. Bertambah per PR fitur (090+); tiap layar yang boleh dibuka
// dari luar juga harus ada di `PATH_DIIZINKAN` (deep-link.ts).
//
// Sejak PR-090 layar terbagi menurut status sesi (App.tsx): Masuk & Verifikasi
// hanya saat keluar; Onboarding hanya saat wizard diperlukan (PR-091); sisanya
// hanya saat masuk. Deep link ke layar yang tidak ada di stack aktif diabaikan.
import type { NavigatorScreenParams } from "@react-navigation/native";

import type { BagianCv } from "../cv/bagian";
import type { JenisKarier } from "../profil/karier";

/** Tab bawah (PR-092). PR-093+ menambah Lowongan/Lamaran. */
export type TabParamList = {
  Beranda: undefined;
  Profil: undefined;
  Cv: undefined;
};

export type RootStackParamList = {
  Masuk: undefined;
  /** Nomor sudah ternormalisasi E.164; detik tunggu sebelum boleh kirim ulang. */
  Verifikasi: { phone: string; retryAfterSeconds: number };
  /** PR-091: hanya terdaftar saat masuk DAN wizard diperlukan. */
  Onboarding: undefined;
  Utama: NavigatorScreenParams<TabParamList> | undefined;
  // --- PR-092: satu bagian per layar ---
  ProfilDasar: undefined;
  ProfilSensitif: undefined;
  Karier: { jenis: JenisKarier };
  /** `id` null = item baru. */
  KarierForm: { jenis: JenisKarier; id: string | null };
  CvEditor: { id: string };
  CvBagian: { id: string; bagian: BagianCv };
};
