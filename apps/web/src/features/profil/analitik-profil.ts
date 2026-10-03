// Event funnel `profil_lengkap` (PR-082, KPI "aktivasi: daftar → profil lengkap").
//
// Definisi (keputusan owner 2026-10-03): profil berisi MINIMAL — headline +
// kota/provinsi + ≥1 keahlian. Paling dekat dengan "profil siap dicocokkan" di
// metrik admin (PR-080) tanpa menanyai server. Dikirim SEKALI per akun per
// perangkat (`sekaliSaja`); id akun hanya menjadi kunci penanda lokal.
import type { QueryClient } from "@tanstack/react-query";
import { profilesKeys } from "@nawasena/api-client";
import type { SeekerProfile } from "@nawasena/schemas";
import { sekaliSaja, track } from "../../shared/analitik.js";

export function profilCukupLengkap(
  profil: Pick<SeekerProfile, "headline" | "city" | "province"> | undefined,
  jumlahKeahlian: number,
): boolean {
  if (profil === undefined) return false;
  const adaHeadline = (profil.headline ?? "").trim() !== "";
  const adaLokasi = (profil.city ?? "").trim() !== "" || (profil.province ?? "").trim() !== "";
  return adaHeadline && adaLokasi && jumlahKeahlian >= 1;
}

/**
 * Periksa dari cache TanStack sesudah profil/keahlian tersimpan. `petunjuk`
 * mengisi yang baru saja disimpan, karena cache-nya bisa belum diperbarui.
 */
export function periksaProfilLengkap(
  queryClient: QueryClient,
  sub: string | null,
  petunjuk: { profil?: SeekerProfile; keahlianBaru?: boolean } = {},
): void {
  if (sub === null) return;
  const profil = petunjuk.profil ?? queryClient.getQueryData<SeekerProfile>(profilesKeys.me(sub));
  const keahlian = queryClient.getQueryData<unknown[]>(profilesKeys.skills(sub))?.length ?? 0;
  const jumlah = Math.max(keahlian, petunjuk.keahlianBaru === true ? 1 : 0);
  if (profilCukupLengkap(profil, jumlah)) {
    sekaliSaja(`profil_lengkap.${sub}`, () => {
      track("profil_lengkap");
    });
  }
}
