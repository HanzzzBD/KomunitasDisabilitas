// Titik masuk aplikasi. SENGAJA setipis mungkin: hanya menempelkan React ke
// DOM. Segala perakitan (router, provider, error boundary) tinggal di `app/`,
// sehingga test bisa merender App tanpa menyentuh `document` milik halaman
// nyata — dan agar berkas ini tidak menjadi tempat sampah global.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { daftarkanServiceWorker } from "./shared/pwa/daftar.js";

const wadah = document.getElementById("root");

// Gagal keras, bukan diam. Kalau elemen ini hilang (mis. index.html disunting),
// layar putih tanpa pesan jauh lebih sulit ditelusuri daripada satu error.
if (wadah === null) {
  throw new Error("Elemen #root tidak ditemukan di index.html");
}

createRoot(wadah).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Fondasi PWA (ADR-009). Dipanggil SETELAH render, tanpa `await`: pendaftaran
// service worker tidak boleh menunda apa pun yang dilihat pengguna, dan
// kegagalannya tidak boleh menjatuhkan aplikasi.
void daftarkanServiceWorker({ produksi: import.meta.env.PROD });
