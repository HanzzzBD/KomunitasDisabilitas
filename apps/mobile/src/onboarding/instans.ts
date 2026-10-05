// Perakitan koordinator onboarding (PR-091) dengan dependensi nyata.
import { getAccessibility } from "@nawasena/api-client";

import { a11yStore, penyimpananAsync } from "../a11y/store";
import { apiClient, sesiStore } from "../api";
import { createKoordinatorOnboarding } from "./koordinator";

/**
 * Sakelar rollback (paritas `VITE_ONBOARDING_WIZARD_ENABLED` web): bawaan
 * AKTIF; hanya `"false"` yang mematikan, sehingga build yang lupa menyetelnya
 * tetap menampilkan wizard.
 */
export const wizardAktif = process.env.EXPO_PUBLIC_ONBOARDING_WIZARD_ENABLED !== "false";

export const onboarding = createKoordinatorOnboarding({
  sesi: sesiStore,
  a11y: a11yStore,
  ambilProfil: () => getAccessibility(apiClient),
  penanda: penyimpananAsync,
  wizardAktif,
});

export const onboardingStore = onboarding.store;
