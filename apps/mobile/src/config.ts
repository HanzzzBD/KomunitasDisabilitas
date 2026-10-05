// Konfigurasi build-time mobile. Variabel `EXPO_PUBLIC_*` di-inline Metro saat
// bundling — jadi isinya PUBLIK (ikut APK). Jangan pernah menaruh rahasia di sini.

// 10.0.2.2 = localhost mesin host dilihat dari emulator Android.
const API_DEV = "http://10.0.2.2:3000/api/v1";

/** URL dasar API tanpa garis miring penutup. Build non-dev wajib HTTPS. */
export function apiBaseUrl(
  nilai: string | undefined = process.env.EXPO_PUBLIC_API_URL,
  dev: boolean = typeof __DEV__ !== "undefined" && __DEV__,
): string {
  const url = (nilai ?? "").trim().replace(/\/+$/, "");
  if (url === "") {
    if (dev) return API_DEV;
    throw new Error("EXPO_PUBLIC_API_URL wajib diisi untuk build non-dev.");
  }
  if (!dev && !url.startsWith("https://")) {
    throw new Error("EXPO_PUBLIC_API_URL wajib HTTPS untuk build non-dev.");
  }
  return url;
}
