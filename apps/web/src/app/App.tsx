// Akar komponen aplikasi — perakitan, bukan tampilan.
//
// Isinya sengaja hanya dua lapis: provider dan router. Setiap kali sesuatu yang
// bukan perakitan masuk ke sini, ia menjadi hal yang tidak bisa dirender test
// tanpa menyalakan seluruh aplikasi.
//
// Error boundary, banner offline, dan skeleton menyusul di PR-025c.
// `RouterProvider` diambil dari "react-router", BUKAN dari "react-router/dom".
// Subpath /dom mengekspor RouterProvider-nya sendiri dengan salinan konteks
// yang terpisah, sehingga <Link> (yang membaca konteks dari entry utama) tidak
// menemukan router dan melempar "Cannot destructure property 'basename' ...".
// Ditemukan lewat test, bukan lewat membaca dokumentasi.
import { createBrowserRouter, RouterProvider } from "react-router";
import { Providers } from "./providers.js";
import { ruteApp } from "./routes.js";

// Dibuat di tingkat modul, BUKAN di dalam komponen: `createBrowserRouter`
// memasang listener history, dan merakitnya ulang tiap render akan mereset
// posisi navigasi pengguna.
const router = createBrowserRouter(ruteApp);

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
