import type { z } from "zod";
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

export type GalatKolom = Readonly<Record<string, string>>;

export function galatPerKolom(galat: z.ZodError): GalatKolom {
  const hasil: Record<string, string> = {};
  for (const masalah of galat.issues) hasil[masalah.path.join(".")] ??= masalah.message;
  return hasil;
}

const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "resume.galat.jaringan",
  BATAS_CV_TERCAPAI: "resume.galat.batas",
};

export function pesanGalatResume(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
