// Tumpukan provider aplikasi.
//
// Dipisah dari App agar test bisa membungkus komponen apa pun dengan konteks
// yang SAMA PERSIS dengan produksi. Provider yang dirakit ulang di dalam test
// akan menyimpang dari yang dipakai pengguna, dan penyimpangannya baru
// ketahuan saat produksi berperilaku lain.
import { useState, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { A11yStore } from "@nawasena/a11y";
import { createQueryClient } from "./query-client.js";
import { PenyediaI18n } from "../shared/i18n/index.js";
import type { ModeBahasa } from "../shared/i18n/index.js";
import { PenyediaA11y, SambungkanBahasa, buatStoreWeb } from "./penyedia-a11y.js";

export interface ProvidersProps {
  children: ReactNode;
  /** Disuntik test untuk cache bersih; produksi memakai bawaan. */
  queryClient?: QueryClient;
  /**
   * Mode bahasa awal. Sejak PR-026c ini hanya nilai SEMENTARA: begitu store
   * preferensi terbaca, `SambungkanBahasa` mengambil alih. Tetap berguna untuk
   * test yang ingin memaksa satu mode tanpa menyentuh preferensi.
   */
  modeBahasaAwal?: ModeBahasa;
  /** Disuntik test; produksi merakit sendiri di atas localStorage. */
  a11yStore?: A11yStore;
}

export function Providers({ children, queryClient, modeBahasaAwal, a11yStore }: ProvidersProps) {
  // useState dengan initializer malas, BUKAN `?? createQueryClient()` langsung
  // di JSX: bentuk itu membuat klien baru pada SETIAP render, dan setiap klien
  // baru membawa cache kosong. Gejalanya menyesatkan — data seolah-olah tidak
  // pernah ter-cache, dan permintaan berulang tanpa sebab yang terlihat.
  // StrictMode React 18 (yang merender dua kali di dev) membuat ini muncul
  // lebih awal, tetapi bug-nya nyata di produksi juga.
  const [klien] = useState(() => queryClient ?? createQueryClient());
  const [a11y] = useState(() => a11yStore ?? buatStoreWeb());

  // Urutannya menentukan, dan tidak boleh ditukar:
  //   - i18n DI DALAM QueryClientProvider: pesan kesalahan dari lapisan data
  //     kelak perlu diterjemahkan. Kebalikannya tidak pernah dibutuhkan.
  //   - `SambungkanBahasa` DI DALAM PenyediaI18n, sebab ia memakai `useModeBahasa`.
  //   - `PenyediaA11y` boleh di mana saja; ia hanya menyentuh <html>.
  return (
    <QueryClientProvider client={klien}>
      <PenyediaA11y store={a11y}>
        <PenyediaI18n modeAwal={modeBahasaAwal}>
          <SambungkanBahasa store={a11y} />
          {children}
        </PenyediaI18n>
      </PenyediaA11y>
    </QueryClientProvider>
  );
}
