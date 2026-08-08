// Tumpukan provider aplikasi.
//
// Dipisah dari App agar test bisa membungkus komponen apa pun dengan konteks
// yang SAMA PERSIS dengan produksi. Provider yang dirakit ulang di dalam test
// akan menyimpang dari yang dipakai pengguna, dan penyimpangannya baru
// ketahuan saat produksi berperilaku lain.
import { useState, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createQueryClient } from "./query-client.js";

export interface ProvidersProps {
  children: ReactNode;
  /** Disuntik test untuk cache bersih; produksi memakai bawaan. */
  queryClient?: QueryClient;
}

export function Providers({ children, queryClient }: ProvidersProps) {
  // useState dengan initializer malas, BUKAN `queryClient ?? createQueryClient()`
  // langsung di JSX: bentuk itu membuat klien baru pada SETIAP render, dan
  // setiap klien baru membawa cache kosong. Gejalanya menyesatkan — data
  // seolah-olah tidak pernah ter-cache, dan permintaan berulang tanpa sebab
  // yang terlihat. StrictMode React 18 (yang merender dua kali di dev) membuat
  // ini muncul lebih awal, tetapi bug-nya nyata di produksi juga.
  const [klien] = useState(() => queryClient ?? createQueryClient());
  return <QueryClientProvider client={klien}>{children}</QueryClientProvider>;
}
