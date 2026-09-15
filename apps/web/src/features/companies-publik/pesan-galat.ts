// Kalimat galat halaman publik perusahaan (PR-054) — pola sama dengan
// `features/admin/companies-pesan-galat.ts`.
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "shell.galat.jaringan",
};

export function pesanGalatPublik(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
