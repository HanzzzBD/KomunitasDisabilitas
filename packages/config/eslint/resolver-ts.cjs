// Resolver impor untuk penentu ESM/NodeNext — `./x.js` yang berkasnya `x.ts`.
//
// KENAPA INI ADA, dan kenapa ia bukan kerapian.
//
// `apps/api` memakai `"module": "NodeNext"`. Aturan TypeScript di sana menuntut
// setiap impor relatif menyebut ekstensi RUNTIME-nya (`./profiles.service.js`)
// meski berkas yang ada di disk adalah `.ts`. Seluruh berkas di `apps/api/src`
// ditulis begitu; tidak satu pun memakai bentuk tanpa ekstensi.
//
// Resolver `node` bawaan tidak memetakan `.js` ke `.ts`. Akibatnya SETIAP impor
// relatif di `apps/api` GAGAL di-resolve oleh `eslint-plugin-boundaries` — dan
// kegagalan itu tidak berbunyi. Dependensi yang tidak bisa di-resolve tidak
// punya `type`, dan `dependencyRelationship()` (src/core/dependencyInfo.js)
// mengembalikan `null` untuk dependensi tanpa tipe: aturannya dilewati
// diam-diam, bukan dilaporkan.
//
// Hasilnya gerbang arsitektur yang HIJAU atas kode yang tidak pernah benar-benar
// diperiksanya — bentuk paling mahal dari rasa aman palsu, sebab ia terlihat di
// repo, disebut di CLAUDE.md sebagai penjaga T1, dan tidak menjaga apa pun.
// Dibuktikan dengan menanam pelanggaran sungguhan (service `profiles` mengimpor
// repository `users`) dan mendapati `pnpm lint` tetap hijau.
//
// LINGKUPNYA SENGAJA SEMPIT: hanya penentu RELATIF/ABSOLUT. Penentu telanjang
// (`express`, `@nawasena/schemas`) sengaja tidak disentuh dan diserahkan ke
// resolver `node` yang tetap terpasang sesudah berkas ini. Alasannya bukan
// kemalasan: `isExternal()` di plugin itu menilai "eksternal" dari NAMA dan dari
// apakah path-nya memuat `node_modules`, jadi mengubah cara paket workspace
// di-resolve akan mengubah klasifikasi `@nawasena/*` — perubahan perilaku yang
// jauh melampaui cacat yang sedang diperbaiki.
//
// TANPA DEPENDENSI BARU. `eslint-import-resolver-typescript` bisa melakukan ini,
// tetapi ia juga me-resolve paket workspace ke sumbernya — persis perubahan yang
// dihindari di paragraf sebelumnya — dan menuntut daftar `project` tsconfig,
// sementara fixture preset ini SENGAJA berada di luar tsconfig mana pun (lihat
// catatan di `__tests__/boundaries.test.ts`).
const fs = require("node:fs");
const path = require("node:path");

/** Ekstensi sumber yang benar-benar ada di disk. */
const EKSTENSI_SUMBER = [".ts", ".tsx", ".mts", ".cts"];

/** Ekstensi runtime yang ditulis di penentu impor. */
const EKSTENSI_RUNTIME = [".js", ".jsx", ".mjs", ".cjs"];

function berkasAda(kandidat) {
  try {
    return fs.statSync(kandidat).isFile();
  } catch {
    return false;
  }
}

/**
 * Urutan tebakan untuk satu penentu, dari yang paling mungkin benar.
 *
 * URUTANNYA BERARTI. `./x.js` dicoba sebagai `./x.ts` LEBIH DULU daripada
 * sebagai `./x.js` apa adanya: di repo ini yang ada di disk adalah `.ts`, dan
 * berkas `.js` bernama sama — bila suatu saat ada — hampir pasti artefak build
 * yang tidak boleh ikut diklasifikasikan sebagai elemen arsitektur.
 */
function kandidatUntuk(dasar) {
  const hasil = [];
  const ekstensi = path.extname(dasar);

  if (EKSTENSI_RUNTIME.includes(ekstensi)) {
    const tanpaEkstensi = dasar.slice(0, -ekstensi.length);
    for (const e of EKSTENSI_SUMBER) hasil.push(tanpaEkstensi + e);
  }

  // Apa adanya — menampung `.json`, dan `.js` yang memang berkas `.js`.
  hasil.push(dasar);

  // Penentu tanpa ekstensi (dipakai fixture preset dan sebagian paket lain).
  for (const e of [...EKSTENSI_SUMBER, ...EKSTENSI_RUNTIME]) hasil.push(dasar + e);

  // Direktori ber-`index`.
  for (const e of [...EKSTENSI_SUMBER, ...EKSTENSI_RUNTIME]) {
    hasil.push(path.join(dasar, `index${e}`));
  }

  return hasil;
}

/** Kontrak resolver eslint-module-utils versi 2. */
exports.interfaceVersion = 2;

/**
 * @param {string} source penentu impor apa adanya, mis. "../x/y.js"
 * @param {string} file berkas yang memuat impor itu
 * @returns {{ found: boolean, path?: string }}
 */
exports.resolve = function resolve(source, file) {
  // Penentu telanjang diserahkan ke resolver berikutnya (lihat catatan di atas).
  if (!source.startsWith(".") && !path.isAbsolute(source)) return { found: false };

  const dasar = path.resolve(path.dirname(file), source);
  for (const kandidat of kandidatUntuk(dasar)) {
    if (berkasAda(kandidat)) return { found: true, path: kandidat };
  }
  return { found: false };
};
