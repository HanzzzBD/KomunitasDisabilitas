// Daftar layar root. Bertambah per PR fitur (090+); tiap layar yang boleh dibuka
// dari luar juga harus ada di `PATH_DIIZINKAN` (deep-link.ts).
//
// Sejak PR-090 layar terbagi menurut status sesi (App.tsx): Masuk & Verifikasi
// hanya saat keluar; Onboarding hanya saat wizard diperlukan (PR-091); sisanya
// hanya saat masuk. PR-094 menahan tautan sampai sesi/onboarding/navigator siap.
import type { NavigatorScreenParams } from "@react-navigation/native";

import type { BagianCv } from "../cv/bagian";
import type { JenisKarier } from "../profil/karier";

/** Lima tab berurutan; setiap tab mempertahankan stack dan state sendiri. */
export type TabParamList = {
  Beranda: NavigatorScreenParams<HomeStackParamList> | undefined;
  Cari: NavigatorScreenParams<JobsStackParamList> | undefined;
  Lamaran: NavigatorScreenParams<ApplicationsStackParamList> | undefined;
  Cv: NavigatorScreenParams<ResumeStackParamList> | undefined;
  Profil: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type RootStackParamList = {
  Employer: undefined;
  Masuk: undefined;
  /** Nomor sudah ternormalisasi E.164; detik tunggu sebelum boleh kirim ulang. */
  Verifikasi: { phone: string; retryAfterSeconds: number };
  /** PR-091: hanya terdaftar saat masuk DAN wizard diperlukan. */
  Onboarding: undefined;
  Utama:
    | NavigatorScreenParams<TabParamList>
    | NavigatorScreenParams<EmployerStackParamList>
    | undefined;
  // --- PR-092: satu bagian per layar ---
  ProfilDasar: undefined;
  ProfilSensitif: undefined;
  Karier: { jenis: JenisKarier };
  /** `id` null = item baru. */
  KarierForm: { jenis: JenisKarier; id: string | null };
  CvEditor: { id: string };
  CvChat: undefined;
  CvBagian: { id: string; bagian: BagianCv };
  // --- PR-093 ---
  LowonganDetail: { id: string };
  LamaranDetail: { id: string };
  Notifikasi: undefined;
  BerandaRingkasan: undefined;
  LowonganDaftar: undefined;
  Rekomendasi: undefined;
  LamaranDaftar: undefined;
  CvDaftar: undefined;
  ProfilUtama: undefined;
  Aksesibilitas: undefined;
  Pengaturan: undefined;
  Bantuan: undefined;
};

export type HomeStackParamList = Pick<
  RootStackParamList,
  "BerandaRingkasan" | "Rekomendasi" | "LowonganDetail" | "Notifikasi"
>;
export type JobsStackParamList = Pick<RootStackParamList, "LowonganDaftar" | "LowonganDetail">;
export type ApplicationsStackParamList = Pick<
  RootStackParamList,
  "LamaranDaftar" | "LamaranDetail"
>;
export type ResumeStackParamList = Pick<
  RootStackParamList,
  "CvDaftar" | "CvChat" | "CvEditor" | "CvBagian"
>;
export type ProfileStackParamList = Pick<
  RootStackParamList,
  | "ProfilUtama"
  | "Employer"
  | "ProfilDasar"
  | "ProfilSensitif"
  | "Karier"
  | "KarierForm"
  | "Aksesibilitas"
  | "Pengaturan"
  | "Bantuan"
>;
export type AuthStackParamList = Pick<RootStackParamList, "Masuk" | "Verifikasi">;
export type EmployerStackParamList = Pick<
  RootStackParamList,
  "Employer" | "Pengaturan" | "Notifikasi" | "Aksesibilitas" | "Bantuan"
>;
export type OnboardingStackParamList = Pick<RootStackParamList, "Onboarding">;
/** Only these destinations are registered at the actual root. */
export type RootNavigatorParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  OnboardingFlow: NavigatorScreenParams<OnboardingStackParamList> | undefined;
  Utama:
    | NavigatorScreenParams<TabParamList>
    | NavigatorScreenParams<EmployerStackParamList>
    | undefined;
};
