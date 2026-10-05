// TanStack Query mobile (PR-092, ADR-014): server state di MEMORI saja.
//
// Tanpa persister, dengan sengaja: profil memuat data disabilitas, dan "data
// sensitif tidak di-cache lokal tanpa perlu" (Security Considerations PR-092).
// Cache hidup selama proses app hidup dan DIBUANG saat keluar — perangkat
// bersama tidak boleh menampilkan profil pengguna sebelumnya sekejap pun.
import { QueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";

import { sesiStore } from "./api";
import { subDariToken } from "./onboarding/koordinator";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

/** Pembersih tambahan saat keluar (mis. PDF CV di cache berkas). */
const pembersih: Array<() => void | Promise<void>> = [];

export function saatKeluar(fn: () => void | Promise<void>): void {
  pembersih.push(fn);
}

sesiStore.subscribe((s, sebelum) => {
  if (sebelum.status === "masuk" && s.status === "keluar") {
    queryClient.clear();
    for (const fn of pembersih) void Promise.resolve(fn()).catch(() => undefined);
  }
});

/** `sub` akun yang sedang masuk — melingkupi query key (paritas web). */
export function useSub(): string | null {
  return useStore(sesiStore, (s) => subDariToken(s.accessToken));
}
