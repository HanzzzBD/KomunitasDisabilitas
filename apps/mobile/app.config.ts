import type { ExpoConfig } from "expo/config";

// projectId EAS dibaca dari env, bukan ditulis di repo: ia baru ada setelah
// pemilik akun menjalankan `eas init` (lihat README.md).
const projectId = process.env.EAS_PROJECT_ID;

// Build EAS adalah build release: URL API wajib HTTPS dan datang dari environment
// EAS (`preview` untuk profil internal), tidak pernah dari repo. Gagal di sini —
// di mesin build — jauh lebih murah daripada APK yang crash saat dibuka di HP uji.
// (src/config.ts memeriksa hal yang sama saat runtime sebagai lapis kedua.)
if (process.env.EAS_BUILD === "true") {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
  if (!apiUrl.startsWith("https://")) {
    throw new Error(
      "EXPO_PUBLIC_API_URL kosong atau bukan HTTPS. Isi di environment EAS profil build ini.",
    );
  }
}

const config: ExpoConfig = {
  name: "Nawasena",
  slug: "nawasena",
  version: "0.1.0",
  orientation: "portrait",
  // Tanpa `userInterfaceStyle`: bawaan Expo = terang. Mode kontras/gelap dipetakan
  // dari profil aksesibilitas di PR-091 (butuh expo-system-ui).
  // Skema deep link — harus sama dengan SKEMA di src/navigation/deep-link.ts.
  scheme: "nawasena",
  platforms: ["android"],
  android: {
    // Permanen setelah rilis ke Play Store.
    package: "id.nawasena.app",
    // Refresh token di SecureStore tidak ikut backup; sisa data lain juga tidak
    // perlu — sesi dipulihkan dengan login ulang, bukan dari backup.
    allowBackup: false,
    // Tanpa izin tambahan di PR-088 (kamera/notifikasi menyusul per fitur).
    permissions: [],
  },
  plugins: ["expo-secure-store"],
  extra: projectId ? { eas: { projectId } } : {},
};

export default config;
