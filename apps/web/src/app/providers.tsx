// Tumpukan provider aplikasi.
//
// Dipisah dari App agar test bisa membungkus komponen apa pun dengan konteks
// yang SAMA PERSIS dengan produksi. Provider yang dirakit ulang di dalam test
// akan menyimpang dari yang dipakai pengguna, dan penyimpangannya baru
// ketahuan saat produksi berperilaku lain.
import { useState, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createQueryClient } from "./query-client.js";
import { PenyediaI18n } from "../shared/i18n/index.js";
import type { ModeBahasa } from "../shared/i18n/index.js";

export interface ProvidersProps {
  children: ReactNode;
  /** Disuntik test untuk cache bersih; produksi memakai bawaan. */
  queryClient?: QueryClient;
  /**
   * Mode bahasa awal. PR-026 akan mengambil alih lewat preferensi pengguna
   * yang tersimpan; sampai saat itu, bawaannya `id`.
   */
  modeBahasaAwal?: ModeBahasa;
}

export function Providers({ children, queryClient, modeBahasaAwal }: ProvidersProps) {
  // useState dengan initializer malas, BUKAN `queryClient ?? createQueryClient()`
  // langsung di JSX: bentuk itu membuat klien baru pada SETIAP render, dan
  // setiap klien baru membawa cache kosong. Gejalanya menyesatkan — data
  // seolah-olah tidak pernah ter-cache, dan permintaan berulang tanpa sebab
  // yang terlihat. StrictMode React 18 (yang merender dua kali di dev) membuat
  // ini muncul lebih awal, tetapi bug-nya nyata di produksi juga.
  const [klien] = useState(() => queryClient ?? createQueryClient());

  // i18n DI DALAM QueryClientProvider: pesan kesalahan dari lapisan data kelak
  // perlu diterjemahkan, dan urutan ini membuat itu mungkin tanpa menyusun
  // ulang apa pun. Kebalikannya tidak: teks tidak pernah butuh cache query.
  return (
    <QueryClientProvider client={klien}>
      <PenyediaI18n modeAwal={modeBahasaAwal}>{children}</PenyediaI18n>
    </QueryClientProvider>
  );
}
