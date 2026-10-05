import type { SeekerProfile } from "@nawasena/schemas";

export function profilCukupLengkap(
  profil: Pick<SeekerProfile, "headline" | "city" | "province"> | undefined,
  jumlahKeahlian: number,
): boolean {
  if (profil === undefined) return false;
  const adaHeadline = (profil.headline ?? "").trim() !== "";
  const adaLokasi = (profil.city ?? "").trim() !== "" || (profil.province ?? "").trim() !== "";
  return adaHeadline && adaLokasi && jumlahKeahlian >= 1;
}
