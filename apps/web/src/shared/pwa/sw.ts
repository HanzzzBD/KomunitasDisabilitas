// Service worker — ADR-009 "fondasi PWA".
//
// Dibangun terpisah dari bundel aplikasi (lihat `vite.sw.config.ts`) karena ia
// berjalan di konteks lain: tanpa DOM, tanpa React, dan dengan siklus hidup
// sendiri yang bertahan setelah tab ditutup.
//
// YANG DILAKUKAN HARI INI: menyimpan aset build ber-hash agar kunjungan
// berikutnya lebih ringan. Itu saja.
//
// YANG SENGAJA TIDAK DILAKUKAN: menyajikan halaman saat luring. MVP ini
// online-only (ADR-009), dan berkas ini ada sebagai FONDASI — supaya
// peningkatan ke offline dasar di Fase 2 menjadi penambahan aturan, bukan
// penulisan ulang arsitektur. Menambahkan fallback offline sekarang berarti
// mengirim fitur yang belum diputuskan bentuknya.
import { NAMA_CACHE, cacheUsang, putuskanStrategi } from "./strategi-cache.js";

// Tipe konteks service worker dideklarasikan SEPERLUNYA di sini, bukan dengan
// `/// <reference lib="webworker" />`. Lib itu menabrakkan definisi `self`,
// `location`, dan `fetch` dengan lib DOM yang dipakai seluruh apps/web, dan
// jalan keluarnya adalah tsconfig terpisah — mesin baru yang harus dirawat
// demi satu berkas. Yang dipakai berkas ini hanya lima anggota; menuliskannya
// lebih murah, dan lebih jujur tentang seberapa sedikit yang dibutuhkan.
interface PeristiwaPanjang {
  waitUntil(janji: Promise<unknown>): void;
}
interface PeristiwaAmbil extends PeristiwaPanjang {
  readonly request: Request;
  respondWith(respons: Promise<Response> | Response): void;
}
interface KonteksSW {
  addEventListener(nama: "install" | "activate", cb: (e: PeristiwaPanjang) => void): void;
  addEventListener(nama: "fetch", cb: (e: PeristiwaAmbil) => void): void;
  readonly clients: { claim(): Promise<void> };
  readonly location: { readonly origin: string };
}

declare const self: KonteksSW;

self.addEventListener("install", () => {
  // `skipWaiting()` SENGAJA TIDAK dipanggil. Ia membuat service worker baru
  // mengambil alih tab yang sedang terbuka, sehingga aset lama dan baru bisa
  // bercampur di satu halaman yang sudah berjalan — sumber galat "chunk gagal
  // dimuat" yang muncul tepat setelah deploy. Versi baru mengambil alih saat
  // seluruh tab ditutup, dan itu perilaku yang bisa diprediksi.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Buang cache versi lama. Tanpa ini, tiap kenaikan versi meninggalkan
      // salinan penuh aset lama di disk pengguna — selamanya.
      const nama = await caches.keys();
      await Promise.all(cacheUsang(nama).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const strategi = putuskanStrategi(
    {
      url: event.request.url,
      method: event.request.method,
      navigasi: event.request.mode === "navigate",
    },
    self.location.origin,
  );

  // "lewati" berarti TIDAK memanggil `respondWith` sama sekali — browser
  // menangani permintaannya seolah service worker tidak ada. Itu berbeda dari
  // "teruskan ke fetch()", yang tetap melewati kita dan bisa mengubah perilaku
  // streaming, kredensial, serta pelaporan galat jaringan.
  if (strategi === "lewati") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(NAMA_CACHE);
      const tersimpan = await cache.match(event.request);
      if (tersimpan !== undefined) return tersimpan;

      const respons = await fetch(event.request);
      // Hanya simpan yang benar-benar berhasil. Menyimpan 404 atau respons
      // parsial berarti menyajikan kegagalan itu berulang kali.
      if (respons.ok && respons.status === 200) {
        await cache.put(event.request, respons.clone());
      }
      return respons;
    })(),
  );
});
