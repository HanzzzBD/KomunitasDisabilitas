// Entry point apps/api — HANYA gerbang fail-fast, lalu serahkan perakitan ke
// ./boot.ts (PR-006; wiring modul PR-008).
//
// ATURAN YANG TIDAK BOLEH DILANGGAR DI FILE INI:
// jangan menambah import statis apa pun yang (langsung atau lewat rantai
// import) menyentuh `@prisma/client`. Prisma memuat `apps/api/.env` ke
// `process.env` saat di-import; bila itu terjadi sebelum gerbang di bawah
// berjalan, variabel yang HILANG akan tertambal DIAM-DIAM dan boot yang
// seharusnya mati justru lanjut. Karena itu seluruh wiring — termasuk core/db,
// core/audit, dan modul — hidup di ./boot.ts yang di-import SECARA DINAMIS
// setelah semua gerbang lolos. Diuji di crypto-boot.test.ts.
//
// Membaca .env BUKAN dilarang — yang dilarang adalah membacanya diam-diam.
// Pemuatan .env adalah properti PERINTAH PELUNCUR, bukan kode aplikasi:
//   dev   → `tsx watch --env-file-if-exists=.env src/index.ts` (script "dev")
//   prod  → tanpa flag; env var dari container/CI (ADR-015, 12-factor)
// Dengan flag Node itu, env var yang sudah ada TIDAK ditimpa file .env, dan
// gerbang di bawah tetap berjalan atas gabungan keduanya — jadi .env yang
// kekurangan FIELD_KEY_V1 tetap membuat boot mati.
/* eslint-disable no-console -- sebelum logger siap, satu-satunya saluran adalah console */
import { loadEnv, EnvError } from "./core/config/index.js";
import { parseFieldKeys, FieldKeyError, type FieldKeys } from "./core/crypto/index.js";
import { loadQueueConfigs } from "./core/queue/index.js";

let env;
try {
  env = loadEnv();
} catch (err) {
  // Logger belum bisa dibuat (butuh env valid) → console + exit ≠ 0.
  console.error(err instanceof EnvError ? err.message : err);
  process.exit(1);
}

// Fail-fast kunci enkripsi (PR-013, ADR-007): divalidasi SEBELUM logger, koneksi
// DB/Redis, atau listener dibuat — boot dengan kunci hilang/salah panjang/format
// berhenti di sini, bukan saat modul profiles pertama kali mengenkripsi field.
// Kunci hanya hidup di memori; JANGAN log fieldKeys (redaction = lapisan kedua).
let fieldKeys: FieldKeys;
try {
  fieldKeys = parseFieldKeys();
} catch (err) {
  console.error(err instanceof FieldKeyError ? err.message : err);
  process.exit(1);
}

// Konfigurasi antrean juga fail-fast (PR-015a): override env yang salah
// ketahuan saat boot, bukan saat job pertama dikirim.
let queueConfigs;
try {
  queueConfigs = loadQueueConfigs();
} catch (err) {
  console.error(err instanceof EnvError ? err.message : err);
  process.exit(1);
}

// Semua gerbang lolos → baru rakit aplikasi (import dinamis, lihat catatan di atas).
const { startApi } = await import("./boot.js");
await startApi({ env, fieldKeys, queueConfigs });
