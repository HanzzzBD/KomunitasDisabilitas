import { useQuery } from "@tanstack/react-query";
import { getMe, usersKeys } from "@nawasena/api-client";
import { userRoleSchema, type UserRole } from "@nawasena/schemas";
import { useKlienApi } from "../../app/klien-api.js";
import { ambilTokenAkses, useStoreSesi } from "./store.js";

/** Klaim hanya untuk navigasi saat profil dimuat; otorisasi tetap di API. */
function peranDariToken(): UserRole | null {
  const bagian = ambilTokenAkses()?.split(".");
  if (bagian?.length !== 3) return null;
  try {
    const segmen = (bagian[1] ?? "").replaceAll("-", "+").replaceAll("_", "/");
    const biner = atob(segmen.padEnd(segmen.length + ((4 - (segmen.length % 4)) % 4), "="));
    const teks = new TextDecoder().decode(Uint8Array.from(biner, (c) => c.charCodeAt(0)));
    const payload = JSON.parse(teks) as { role?: unknown };
    const peran = userRoleSchema.safeParse(payload.role);
    return peran.success ? peran.data : null;
  } catch {
    return null;
  }
}

export function usePeranSesi(): UserRole | null {
  const status = useStoreSesi((s) => s.status);
  const klien = useKlienApi();
  const profil = useQuery({
    queryKey: usersKeys.me(),
    queryFn: () => getMe(klien),
    enabled: status === "masuk",
  });
  if (status !== "masuk") return null;
  return profil.data?.data.role ?? peranDariToken();
}
