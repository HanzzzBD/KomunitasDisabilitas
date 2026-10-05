// Metro untuk monorepo pnpm. `getDefaultConfig` Expo sudah mendeteksi root
// workspace (watchFolders + nodeModulesPaths) sendiri.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// SATU INSTANCE ZOD — penyebab force close saat start di APK EAS (2026-10-05).
//
// zod menerbitkan CJS (`lib/index.js`) DAN ESM (`lib/index.mjs`). Metro memilih
// berkas menurut kondisi impor, sehingga `import "zod-openapi/extend"` berakhir
// di CJS (memasang `.openapi()` ke `ZodType` milik `index.js`), sementara
// `import { z } from "zod"` di @nawasena/schemas berakhir di ESM — kelas
// `ZodType` LAIN yang tidak pernah dipasangi. Baris `.openapi(...)` pertama di
// schemas lalu melempar "undefined is not a function" saat bundle dimuat, dan
// app tertutup sebelum layar pertama tampil. Web (Vite: ESM untuk keduanya) dan
// Vitest (Node: konsisten) tidak pernah melihatnya.
//
// Semua `zod` dipaksa ke berkas yang dipilih Node untuk @nawasena/schemas.
// Dijaga __tests__/metro-config.test.ts.
const ZOD_TUNGGAL = require.resolve("zod", {
  paths: [path.resolve(__dirname, "../../packages/schemas")],
});

// Paket bersama (@nawasena/schemas, @nawasena/api-client) ditulis gaya NodeNext:
// impor relatif ber-ekstensi `.js` yang menunjuk berkas `.ts`. Metro tidak
// memetakannya sendiri, jadi bila `./x.js` tidak ada, coba `./x` (lalu Metro
// mencoba sourceExts biasa). Ini konfigurasi resolver aplikasi — paketnya
// sendiri tidak di-patch (AC PR-088).
const resolveBawaan = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveBawaan ?? context.resolveRequest;
  if (moduleName === "zod") return { type: "sourceFile", filePath: ZOD_TUNGGAL };
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    try {
      return resolve(context, moduleName, platform);
    } catch {
      return resolve(context, moduleName.slice(0, -3), platform);
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
