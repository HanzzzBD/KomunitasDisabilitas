// Jembatan ke modul native lokal `modules/google-credential` (PR-090).
// Satu-satunya pengimpor modul itu; logika alurnya ada di google.ts.
import { requireOptionalNativeModule } from "expo";

interface ModulGoogleCredential {
  masuk(serverClientId: string, nonce: string): Promise<string>;
}

// Opsional, bukan wajib: Expo Go dan build lama tidak memuat modul ini. Tanpa
// modul, tombol Google disembunyikan — bukan crash saat app dibuka.
const modul = requireOptionalNativeModule<ModulGoogleCredential>("NawasenaGoogleCredential");

export const credentialManagerTersedia = modul !== null;

export function pilihAkunGoogle(serverClientId: string, nonce: string): Promise<string> {
  if (modul === null) return Promise.reject(Object.assign(new Error("GAGAL"), { code: "GAGAL" }));
  return modul.masuk(serverClientId, nonce);
}
