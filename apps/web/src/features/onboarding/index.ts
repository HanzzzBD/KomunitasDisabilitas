// Permukaan publik fitur onboarding (PR-035). Route mengimpor dari sini, bukan
// dari berkas dalamnya — penataan ulang di dalam tidak menyentuh pemakainya.
export { Wizard, type WizardProps } from "./wizard.js";
export { wizardOnboardingAktif } from "./bendera.js";
export {
  idPenggunaSaatIni,
  kunciPenanda,
  sudahOnboarding,
  tandaiOnboardingSelesai,
  type PenyimpananPenanda,
} from "./identitas.js";
export {
  LANGKAH,
  initStateWizard,
  langkahSaatIni,
  reduksiWizard,
  type AksiWizard,
  type Langkah,
  type StateWizard,
} from "./mesin-langkah.js";
