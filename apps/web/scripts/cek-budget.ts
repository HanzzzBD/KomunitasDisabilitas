// Penjaga budget JS awal — AC PR-025: "< 200 KB gzip".
//
// Dipasang SEKARANG, selagi aplikasinya nyaris kosong, karena itulah satu-satunya
// saat baseline-nya jujur. Bagian Risks PR-025 menuliskannya eksplisit:
// "Budget JS terlampaui sejak awal. Mitigasi: CI size-check sejak PR ini."
// Penjaga yang dipasang setelah bundelnya gemuk hanya akan mengesahkan keadaan
// yang sudah terlanjur.
//
// YANG DIHITUNG: hanya berkas JS yang benar-benar diunduh untuk render pertama —
// yaitu `<script type="module">` di index.html PLUS setiap `<link rel="modulepreload">`
// yang Vite tuliskan untuk impor statisnya. Chunk lazy per route (PR-025b) tidak
// ikut, dan memang tidak boleh ikut: seluruh gunanya code-splitting adalah
// membuat berkas itu TIDAK diunduh di awal.
//
// CSS dan peta sumber sengaja di luar hitungan — budget SDD §4.5 menyebut "JS
// awal", dan mencampurnya akan membuat angka ini berhenti bisa dibandingkan
// dengan ambang di dokumen.
/* eslint-disable no-console -- Ini alat baris perintah: keluarannya DIBACA manusia
   di log CI, jadi console adalah antarmukanya, bukan sisa debug. */
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** SDD §4.5. KB biner (1024), bukan 1000 — sebutkan supaya tidak ditafsir dua kali. */
export const BATAS_GZIP_BYTES = 200 * 1024;

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

/**
 * Kumpulkan berkas JS awal dari index.html hasil build.
 *
 * Membaca HTML, bukan menyapu `dist/assets/*.js`: sapuan folder akan ikut
 * menghitung setiap chunk lazy dan melaporkan angka yang jauh lebih besar
 * daripada yang benar-benar diunduh pengguna — penjaga yang berbohong ke arah
 * yang salah, sebab ia akan merah untuk hal yang justru kita inginkan.
 */
export function asetAwalDari(html: string): string[] {
  const jalur = new Set<string>();

  const skrip = /<script[^>]+type="module"[^>]+src="([^"]+)"/g;
  const preload = /<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g;

  for (const pola of [skrip, preload]) {
    let cocok: RegExpExecArray | null;
    while ((cocok = pola.exec(html)) !== null) {
      const src = cocok[1];
      if (src !== undefined && src.endsWith(".js")) jalur.add(src);
    }
  }

  return [...jalur].sort();
}

/**
 * Seluruh berkas .js di dalam dist — awal MAUPUN lazy.
 *
 * Dipakai hanya untuk menghitung selisihnya terhadap aset awal; jangan pernah
 * dipakai sebagai dasar budget (lihat catatan di kepala berkas).
 */
export function daftarJsDi(akarDist: string, prefix = ""): string[] {
  const hasil: string[] = [];
  for (const entri of readdirSync(join(akarDist, prefix), { withFileTypes: true })) {
    const relatif = `${prefix}/${entri.name}`;
    if (entri.isDirectory()) hasil.push(...daftarJsDi(akarDist, relatif));
    else if (entri.name.endsWith(".js")) hasil.push(relatif);
  }
  return hasil.sort();
}

/**
 * Chunk yang TIDAK diunduh saat render pertama — bukti code-splitting.
 *
 * AC PR-025 menyebut "bukti bundle analyzer". Diganti pemeriksaan mesin karena
 * tangkapan layar analyzer tidak bisa membuat CI merah: ia membuktikan keadaan
 * pada satu momen, lalu tidak pernah memeriksa lagi. Nol chunk lazi berarti
 * `import()` dinamis diam-diam ikut ter-inline — regresi yang tidak menimbulkan
 * gejala apa pun selain halaman yang makin lambat.
 */
export function chunkLazy(semuaJs: readonly string[], asetAwal: readonly string[]): string[] {
  const awal = new Set(asetAwal);
  // `sw.js` (PR-025d) ada di `dist` tetapi BUKAN chunk aplikasi: ia dibangun
  // terpisah, berjalan di konteks service worker, dan tidak pernah diunduh
  // sebagai bagian dari halaman. Menghitungnya sebagai "chunk lazy" akan
  // membuat penjaga code-splitting tetap hijau meski seluruh route ter-inline —
  // satu berkas asing sudah cukup memenuhi syarat "> 0".
  return semuaJs.filter((j) => !awal.has(j) && j !== "/sw.js");
}

export interface UkuranAset {
  jalur: string;
  gzipBytes: number;
}

/** Ukuran gzip tiap aset. Gzip, bukan mentah: itu yang benar-benar melintas kabel. */
export function ukurAset(jalurAset: readonly string[], akarDist: string): UkuranAset[] {
  return jalurAset.map((jalur) => {
    const berkas = join(akarDist, jalur.replace(/^\//, ""));
    return { jalur, gzipBytes: gzipSync(readFileSync(berkas)).length };
  });
}

export interface HasilBudget {
  totalGzipBytes: number;
  batasGzipBytes: number;
  lolos: boolean;
  sisaBytes: number;
  aset: UkuranAset[];
}

export function evaluasiBudget(aset: readonly UkuranAset[], batas = BATAS_GZIP_BYTES): HasilBudget {
  const total = aset.reduce((jumlah, a) => jumlah + a.gzipBytes, 0);
  return {
    totalGzipBytes: total,
    batasGzipBytes: batas,
    // `<=`, bukan `<`: tepat di batas masih memenuhi "< 200 KB" pada pembulatan
    // KB yang dipakai dokumen, dan menolak di titik itu hanya menimbulkan
    // perdebatan satu byte.
    lolos: total <= batas,
    sisaBytes: batas - total,
    aset: [...aset],
  };
}

export function ringkas(hasil: HasilBudget): string {
  const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
  const baris = hasil.aset.map((a) => `  ${a.jalur} — ${kb(a.gzipBytes)}`);
  const status = hasil.lolos
    ? `LOLOS — sisa ${kb(hasil.sisaBytes)}`
    : `GAGAL — kelebihan ${kb(-hasil.sisaBytes)}`;
  return [
    `Budget JS awal (gzip): ${kb(hasil.totalGzipBytes)} / ${kb(hasil.batasGzipBytes)}`,
    ...baris,
    status,
  ].join("\n");
}

function jalankan(): void {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const jalurAset = asetAwalDari(html);

  // Nol aset berarti build gagal atau bentuk keluaran Vite berubah. Melaporkan
  // "0 KB, lolos" pada keadaan itu adalah kegagalan penjaga yang paling
  // berbahaya: ia hijau justru ketika ia berhenti mengukur apa pun.
  if (jalurAset.length === 0) {
    console.error("Tidak ada JS awal terdeteksi di dist/index.html — build gagal atau bentuknya berubah.");
    process.exit(1);
  }

  const hasil = evaluasiBudget(ukurAset(jalurAset, DIST));
  console.log(ringkas(hasil));

  // AC PR-025: "Route ter-code-split". Sejak PR-025b tiap route dimuat lewat
  // `import()` dinamis, jadi nol chunk lazy berarti pemecahannya hilang.
  const lazy = chunkLazy(daftarJsDi(DIST), jalurAset);
  console.log(`\nChunk lazy (tidak diunduh di awal): ${lazy.length}`);
  for (const j of lazy) console.log(`  ${j}`);

  if (lazy.length === 0) {
    console.error(
      "\nTidak ada chunk lazy — route seharusnya dipecah per halaman (SDD §4.1).\n" +
        "Periksa apakah `import()` di src/app/routes.ts masih memakai literal statis.",
    );
    process.exit(1);
  }

  if (!hasil.lolos) process.exit(1);
}

// Hanya jalan sebagai CLI; import dari test tidak memicu apa pun.
// Membandingkan jalur yang SUDAH dinormalkan, bukan merakit string `file://`
// sendiri — pada Windows bentuk URL berkas tidak sesederhana itu (huruf drive,
// pemisah terbalik), dan perbandingan string mentah akan meleset diam-diam.
const dijalankanLangsung =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (dijalankanLangsung) jalankan();
