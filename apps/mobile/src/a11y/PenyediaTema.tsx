// ThemeProvider aksesibilitas mobile (PR-091): preferensi efektif → token.
//
// Efektif = `rekonsiliasi(pilihanPengguna, sinyalOS)` — aturan menang yang
// SAMA dengan web: pilihan eksplisit > setelan Android > bawaan. Setiap
// perubahan (sakelar di wizard, setelan OS yang diubah saat app terbuka)
// langsung merender ulang token di seluruh app — itulah pratinjau langsungnya.
import { rekonsiliasi } from "@nawasena/a11y";
import { PenyediaTokenA11y } from "@nawasena/ui-native";
import { useEffect, useMemo, type ReactNode } from "react";
import { AccessibilityInfo } from "react-native";

import { pantauSinyalOS } from "./sinyal-os";
import { a11yStore } from "./store";

export function PenyediaTema({ children }: { children: ReactNode }) {
  const pilihanPengguna = a11yStore((s) => s.pilihanPengguna);
  const os = a11yStore((s) => s.os);
  const efektif = useMemo(() => rekonsiliasi(pilihanPengguna, os), [pilihanPengguna, os]);

  useEffect(
    () => pantauSinyalOS(AccessibilityInfo, (sinyal) => a11yStore.getState().setSinyalOS(sinyal)),
    [],
  );

  return <PenyediaTokenA11y preferensi={efektif}>{children}</PenyediaTokenA11y>;
}
