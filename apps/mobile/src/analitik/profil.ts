import { profilesKeys } from "@nawasena/api-client";
import { profilCukupLengkap } from "@nawasena/formulir";
import type { SeekerProfile } from "@nawasena/schemas";
import type { QueryClient } from "@tanstack/react-query";

import { sekaliSaja, track } from "./instans";

export function periksaProfilLengkap(
  qc: QueryClient,
  sub: string | null,
  petunjuk: { profil?: SeekerProfile; keahlianBaru?: boolean } = {},
) {
  if (!sub) return;
  const profil = petunjuk.profil ?? qc.getQueryData<SeekerProfile>(profilesKeys.me(sub));
  const jumlah = Math.max(
    qc.getQueryData<unknown[]>(profilesKeys.skills(sub))?.length ?? 0,
    petunjuk.keahlianBaru ? 1 : 0,
  );
  if (profilCukupLengkap(profil, jumlah))
    void sekaliSaja(`profil_lengkap.${sub}`, () => track("profil_lengkap"));
}
