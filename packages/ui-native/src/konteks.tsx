// Penyedia token a11y native. Store preferensi (Zustand, @nawasena/a11y) belum
// disambungkan di sini — itu tugas PR-091. Penyedia ini hanya menerima
// preferensi sebagai prop, supaya komponennya bisa diuji per profil tanpa store.
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { AccessibilityPreferences } from "@nawasena/a11y";

import { TOKEN_BAWAAN, tokenNativeDari, type TokenNative } from "./token";

const KonteksToken = createContext<TokenNative>(TOKEN_BAWAAN);

export function PenyediaTokenA11y(props: {
  preferensi: AccessibilityPreferences;
  children: ReactNode;
}) {
  const { preferensi, children } = props;
  const token = useMemo(() => tokenNativeDari(preferensi), [preferensi]);
  return <KonteksToken.Provider value={token}>{children}</KonteksToken.Provider>;
}

/** Token aktif; tanpa penyedia → token bawaan (bukan galat), supaya layar tetap terbaca. */
export function useTokenA11y(): TokenNative {
  return useContext(KonteksToken);
}
