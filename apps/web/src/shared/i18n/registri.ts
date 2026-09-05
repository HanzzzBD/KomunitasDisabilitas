// Registri katalog i18n — shell EAGER, fitur MALAS.
//
// KENAPA ADA. Sebelum ini `katalog/index.ts` merakit seluruh fitur menjadi satu
// objek statis yang di-import provider, sehingga SETIAP teks aplikasi masuk ke
// bundel awal. Halamannya sendiri sudah lazy sejak PR-025, tetapi teksnya tidak
// ikut — jadi tiap fitur baru menaikkan bundel awal dengan seluruh katalognya,
// dan polanya linier: Phase 08 (lowongan) dan Phase 09 (CV) akan menambah
// katalognya masing-masing kepada pengguna yang belum tentu membukanya.
//
// Shell TETAP eager dengan sengaja: teks kerangka (merek, navigasi, banner
// luring, layar kesalahan) dibutuhkan sejak render pertama dan pada layar galat
// yang justru muncul ketika pemuatan lain gagal. Katalog yang harus diunduh
// dulu sebelum pesan "gagal memuat" bisa tampil adalah katalog yang gagal di
// saat paling dibutuhkan.
import { katalogShell } from "./katalog/shell.js";
import type { KatalogFitur } from "./tipe.js";

/**
 * Nama fitur = PREFIKS kunci miliknya (`profil.judul` → `profil`).
 *
 * Kesamaan itu bukan kebetulan yang dimanfaatkan: ia yang membuat kunci hilang
 * bisa dibedakan menjadi dua sebab yang sama sekali berbeda — salah ketik, atau
 * katalog yang belum dideklarasikan rutenya. Lihat `sebabKunciHilang`.
 */
export const FITUR_MALAS = ["auth", "beranda", "pengaturan", "onboarding", "profil"] as const;

export type FiturMalas = (typeof FITUR_MALAS)[number];
export type NamaFitur = "shell" | FiturMalas;

/**
 * Satu `import()` harfiah per fitur, bukan `import(`./katalog/${nama}.js`)`.
 *
 * Import dinamis berpola template memaksa bundler memasukkan SELURUH berkas
 * yang cocok ke dalam graf — persis yang berkas ini hendak hindari, dan
 * kegagalannya senyap: bundel tetap besar sementara kodenya terlihat malas.
 */
const PEMUAT: Readonly<Record<FiturMalas, () => Promise<KatalogFitur>>> = {
  auth: async () => (await import("./katalog/auth.js")).katalogAuth,
  beranda: async () => (await import("./katalog/beranda.js")).katalogBeranda,
  pengaturan: async () => (await import("./katalog/pengaturan.js")).katalogPengaturan,
  onboarding: async () => (await import("./katalog/onboarding.js")).katalogOnboarding,
  profil: async () => (await import("./katalog/profil.js")).katalogProfil,
};

const dimuat = new Map<NamaFitur, KatalogFitur>([["shell", katalogShell]]);
/** Promise per fitur — menahan pemuatan ganda saat dua rute meminta bersamaan. */
const berjalan = new Map<FiturMalas, Promise<void>>();
const pendengar = new Set<() => void>();

let gabungan: KatalogFitur = katalogShell;

function rakitUlang(): void {
  // Objek BARU tiap kali, bukan mutasi: `useSyncExternalStore` membandingkan
  // hasil `getSnapshot` dengan `Object.is`, jadi objek yang dimutasi di tempat
  // tidak akan pernah terlihat berubah dan layar tidak ikut diperbarui.
  gabungan = Object.assign({}, ...dimuat.values()) as KatalogFitur;
  for (const dengar of pendengar) dengar();
}

/** Muat katalog fitur (idempoten). Dipanggil `lazy:` route, bukan komponen. */
export async function muatKatalog(...nama: readonly FiturMalas[]): Promise<void> {
  await Promise.all(
    nama.map(async (f) => {
      if (dimuat.has(f)) return;
      let tugas = berjalan.get(f);
      if (tugas === undefined) {
        tugas = PEMUAT[f]().then((entri) => {
          dimuat.set(f, entri);
          rakitUlang();
        });
        berjalan.set(f, tugas);
      }
      await tugas;
    }),
  );
}

export function katalogSaatIni(): KatalogFitur {
  return gabungan;
}

export function langgananKatalog(dengar: () => void): () => void {
  pendengar.add(dengar);
  return () => pendengar.delete(dengar);
}

export function sudahDimuat(nama: NamaFitur): boolean {
  return dimuat.has(nama);
}

/**
 * Kenapa sebuah kunci tidak ditemukan.
 *
 * Membedakan keduanya penting justru karena keduanya terlihat sama di layar.
 * `belum-dimuat` berarti rutenya lupa menyebut katalognya di `app/routes.ts` —
 * bug deklarasi yang akan muncul HANYA pada halaman itu, dan hanya bagi
 * pengguna yang membukanya langsung lewat URL. `tak-dikenal` adalah salah ketik
 * biasa. Pesan yang menyebut sebabnya menghemat pelacakan yang tidak perlu.
 */
export function sebabKunciHilang(kunci: string): "belum-dimuat" | "tak-dikenal" {
  const prefiks = kunci.split(".")[0];
  const fitur = FITUR_MALAS.find((f) => f === prefiks);
  return fitur !== undefined && !dimuat.has(fitur) ? "belum-dimuat" : "tak-dikenal";
}

/**
 * Hanya untuk test — mengisi registri tanpa menunggu `import()`.
 *
 * Dipakai `__tests__/setup.ts` supaya test yang merender KOMPONEN langsung
 * (lewat `Providers`, bukan lewat router) tetap melihat teksnya. Test itu
 * sedang menguji perilaku komponen, bukan pemuatan katalog; membuat semuanya
 * memanggil `muatKatalog` hanya menambah upacara ke ratusan berkas.
 *
 * BUKAN berarti deklarasi katalog per rute jadi tak terjaga: justru karena
 * setup men-seed semuanya, penjaganya harus memakai registri BERSIH — lihat
 * `i18n-lazy.test.ts`, yang mereset lalu menelusuri router sungguhan.
 */
export function seedKatalogUntukTest(entri: Readonly<Record<NamaFitur, KatalogFitur>>): void {
  for (const [nama, isi] of Object.entries(entri) as [NamaFitur, KatalogFitur][]) {
    dimuat.set(nama, isi);
  }
  rakitUlang();
}

/** Hanya untuk test — mengembalikan registri ke keadaan awal (shell saja). */
export function resetRegistriUntukTest(): void {
  dimuat.clear();
  dimuat.set("shell", katalogShell);
  berjalan.clear();
  rakitUlang();
}
