// core/ai — angka kuota AI dari config, BUKAN hardcode (PR-043, AC-5; SDD §7.1).
//
// Bentuknya meniru `core/queue/definitions.ts` verbatim, dan itu disengaja:
// nilai SDD menjadi DEFAULT yang terdokumentasi, setiap angka boleh ditimpa
// lewat variabel env berpola
//   AI_QUOTA_<FITUR>_PER_DAY     contoh: AI_QUOTA_CV_CHAT_PER_DAY=10
//   AI_QUOTA_GLOBAL_PER_DAY
// Semua override opsional, jadi `.env` yang sudah jalan tidak pernah dipaksa
// berubah saat fitur AI baru lahir.
//
// INI TUAS ROLLBACK-nya (phase-06 PR-043 "Rollback Strategy"): menyetel semua
// variabel ke `0` mematikan AI tanpa deploy — nol BUKAN "tak terbatas",
// melainkan "tidak ada jatah sama sekali". Karena itu batas bawahnya 0 dan
// bukan 1, berbeda dari `RETENTION_*_DAYS` yang justru menolak 0.
//
// BERKAS INI DI-IMPORT STATIS OLEH src/index.ts (gerbang fail-fast keempat).
// Ia hanya boleh menyentuh zod + core/config — TIDAK BOLEH ada rantai import
// yang sampai ke `@prisma/client`, sebab Prisma memuat `.env` saat di-import
// dan akan melangkahi seluruh gerbang boot (lihat catatan di index.ts, dijaga
// crypto-boot.test.ts). Itu pula alasannya berkas ini terpisah dari `quota.ts`
// dan tidak diambil lewat barrel `core/ai`.
import { z } from "zod";
import { EnvError } from "../config/index.js";

/**
 * Fitur AI yang punya jatah. Daftar ini MENCERMINKAN enum `AiFeature` di
 * schema.prisma, tetapi ditulis ulang di sini dengan sengaja: mengimpornya dari
 * `@prisma/client` akan menyeret Prisma ke dalam gerbang boot (lihat catatan
 * kepala berkas). Penjaga kesamaannya adalah test, bukan tipe.
 */
export const AI_FEATURES = [
  "cv_chat",
  "cv_finalize",
  "cv_check",
  "simplify_text",
  "interview_sim",
  "rerank",
  "embed",
] as const;

export type AiQuotaFeature = (typeof AI_FEATURES)[number];

export interface AiQuotaConfig {
  /** Jatah per pengguna per hari WIB, per fitur. 0 = fitur dimatikan. */
  perUserPerDay: Readonly<Record<AiQuotaFeature, number>>;
  /** Pagu harian SELURUH platform. 0 = seluruh AI dimatikan. */
  globalPerDay: number;
}

/**
 * Perkiraan jatah harian tier gratis provider utama (Gemini Flash, ADR-005).
 * Angka tier gratis berubah di luar kendali kita — karena itu ia konstanta
 * bernama yang bisa ditimpa env, bukan bilangan yang terselip di rumus.
 */
export const AI_QUOTA_FREE_TIER_PER_DAY = 1_500;

/**
 * Buffer 20% (SDD §7.1: "global cap harian mengikuti free tier − buffer 20%").
 * Buffer-nya ada karena hitungan kita dan hitungan provider tidak pernah persis
 * sama: retry, panggilan cadangan, dan pembulatan token semuanya membelanjakan
 * jatah yang tidak kita hitung. Berhenti di 80% berarti selisih itu ditanggung
 * buffer, bukan ditanggung pengguna berupa penolakan mendadak dari provider.
 */
export const AI_QUOTA_BUFFER_RATIO = 0.2;

/** Pagu global bawaan = tier gratis − buffer. */
export const AI_QUOTA_GLOBAL_DEFAULT = Math.floor(
  AI_QUOTA_FREE_TIER_PER_DAY * (1 - AI_QUOTA_BUFFER_RATIO),
);

/**
 * Default per fitur.
 *
 * Empat angka pertama VERBATIM dari SDD §7.1 (cv-chat 30, finalize 5,
 * simplify-text 20, rerank 3). Tiga sisanya TIDAK disebut SDD dan diisi
 * eksplisit di sini alih-alih dibiarkan kosong: fitur tanpa entri diperlakukan
 * sebagai jatah nol oleh `quota.ts` (tidak pernah "tak terbatas"), jadi
 * membiarkannya kosong sama dengan mematikan fitur itu diam-diam saat ia lahir.
 * Angkanya sementara dan memang untuk ditimpa lewat env begitu pemakaian nyata
 * terukur (PR-103):
 * - `cv_check` disamakan dengan `cv_finalize` — satu analisis berat per revisi CV;
 * - `interview_sim` di antara chat dan finalize: satu sesi latihan terdiri dari
 *   beberapa giliran, tetapi bukan percakapan tak berujung;
 * - `embed` dipanggil worker saat profil/lowongan berubah, bukan oleh manusia
 *   yang menunggu; jatahnya longgar sebab yang benar-benar membatasinya adalah
 *   pagu global.
 */
export const AI_QUOTA_DEFAULTS: AiQuotaConfig = {
  perUserPerDay: {
    cv_chat: 30,
    cv_finalize: 5,
    cv_check: 5,
    simplify_text: 20,
    interview_sim: 10,
    rerank: 3,
    embed: 50,
  },
  globalPerDay: AI_QUOTA_GLOBAL_DEFAULT,
};

/** Nama variabel env override satu fitur: `cv_chat` → `AI_QUOTA_CV_CHAT_PER_DAY`. */
export function aiQuotaEnvVar(feature: AiQuotaFeature): string {
  return `AI_QUOTA_${feature.toUpperCase()}_PER_DAY`;
}

/** Nama variabel pagu global. */
export const AI_QUOTA_GLOBAL_ENV_VAR = "AI_QUOTA_GLOBAL_PER_DAY";

/** Seluruh variabel override yang dikenali — dipakai dokumentasi & test. */
export function aiQuotaEnvVars(): string[] {
  return [...AI_FEATURES.map(aiQuotaEnvVar), AI_QUOTA_GLOBAL_ENV_VAR];
}

/**
 * Jatah harian: bilangan bulat ≥ 0. Nilai pecahan ditolak — "2,5 panggilan"
 * tidak punya arti bagi penghitung yang naik satu-satu, dan diam-diam
 * membulatkannya berarti operator menyetel sesuatu yang bukan yang ia baca.
 */
const jatahHarianSchema = z
  .number({ invalid_type_error: "harus angka" })
  .int({ message: "harus bilangan bulat" })
  .min(0, { message: "minimal 0 (0 = fitur dimatikan)" });

/**
 * Bangun konfigurasi kuota: default di atas ditimpa override env.
 *
 * Melempar `EnvError` berisi [variabel, alasan] — pola fail-fast yang sama
 * dengan `loadQueueConfigs`, dan dipanggil dari gerbang boot di index.ts
 * sehingga salah ketik ketahuan saat proses menyala, bukan saat pengguna
 * pertama menekan tombol AI.
 */
export function loadAiQuotaConfig(source: NodeJS.ProcessEnv = process.env): AiQuotaConfig {
  const issues: Array<readonly [string, string]> = [];

  const baca = (variable: string, bawaan: number): number => {
    const raw = source[variable];
    if (raw === undefined || raw.trim() === "") return bawaan; // tidak di-set → default
    const angka = Number(raw);
    if (Number.isNaN(angka) || !Number.isFinite(angka)) {
      issues.push([variable, "harus angka"] as const);
      return bawaan;
    }
    const parsed = jatahHarianSchema.safeParse(angka);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) issues.push([variable, issue.message] as const);
      return bawaan;
    }
    return parsed.data;
  };

  const perUserPerDay = {} as Record<AiQuotaFeature, number>;
  for (const feature of AI_FEATURES) {
    perUserPerDay[feature] = baca(aiQuotaEnvVar(feature), AI_QUOTA_DEFAULTS.perUserPerDay[feature]);
  }
  const globalPerDay = baca(AI_QUOTA_GLOBAL_ENV_VAR, AI_QUOTA_DEFAULTS.globalPerDay);

  if (issues.length > 0) throw new EnvError(issues);
  return { perUserPerDay, globalPerDay };
}
