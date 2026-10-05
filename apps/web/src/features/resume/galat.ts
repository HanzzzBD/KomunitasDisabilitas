import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

// Galat per kolom: `@nawasena/formulir` (PR-092), sama dengan mobile.
export { galatPerKolom, type GalatKolom } from "@nawasena/formulir";

const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "resume.galat.jaringan",
  BATAS_CV_TERCAPAI: "resume.galat.batas",
};

export function pesanGalatResume(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
