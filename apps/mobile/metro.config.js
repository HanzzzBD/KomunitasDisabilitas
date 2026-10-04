// Metro untuk monorepo pnpm. `getDefaultConfig` Expo sudah mendeteksi root
// workspace (watchFolders + nodeModulesPaths) sendiri.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Paket bersama (@nawasena/schemas, @nawasena/api-client) ditulis gaya NodeNext:
// impor relatif ber-ekstensi `.js` yang menunjuk berkas `.ts`. Metro tidak
// memetakannya sendiri, jadi bila `./x.js` tidak ada, coba `./x` (lalu Metro
// mencoba sourceExts biasa). Ini konfigurasi resolver aplikasi — paketnya
// sendiri tidak di-patch (AC PR-088).
const resolveBawaan = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveBawaan ?? context.resolveRequest;
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
