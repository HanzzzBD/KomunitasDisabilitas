// PKCE (RFC 7636) — pembuktian kepemilikan untuk klien yang TIDAK punya rahasia.
//
// Aplikasi web dan mobile adalah klien publik: apa pun yang kita tanam di
// dalamnya bisa dibaca siapa saja yang membuka berkasnya. Karena itu penukaran
// `code` menjadi sesi tidak bisa dibuktikan dengan client secret. PKCE
// menggantinya: klien mengarang rahasia SEKALI PAKAI (`code_verifier`),
// mengirim sidik jarinya (`code_challenge`) saat meminta code, lalu menunjukkan
// rahasia aslinya saat menukarkan. Penyerang yang berhasil mencuri `code` di
// tengah jalan tidak bisa menukarkannya tanpa verifier.
//
// Nilainya karena itu HARUS acak-kriptografis, bukan `Math.random()`, dan harus
// sekali pakai.

/** Alfabet `unreserved` RFC 3986 — satu-satunya yang diterima `pkceCodeVerifierSchema`. */
const UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/**
 * Acak dari `crypto.getRandomValues`, BUKAN `Math.random()`.
 *
 * `Math.random()` tidak dijamin tak-terduga: nilainya berasal dari generator
 * yang keadaannya bisa disimpulkan dari keluaran sebelumnya. Untuk nilai yang
 * seluruh gunanya adalah tidak bisa ditebak, itu sama saja dengan tidak ada.
 */
function acak(panjang: number): string {
  const bytes = new Uint8Array(panjang);
  crypto.getRandomValues(bytes);
  // Modulo atas 64 karakter dari 256 nilai byte: 256 habis dibagi 64, jadi
  // tidak ada karakter yang lebih sering muncul (modulo bias).
  return Array.from(bytes, (b) => UNRESERVED[b % UNRESERVED.length]).join("");
}

/** `code_verifier` 64 karakter — di tengah rentang 43–128 yang diizinkan RFC. */
export function buatVerifier(): string {
  return acak(64);
}

/** Nilai `state` anti-CSRF; panjangnya tidak diatur RFC, 32 sudah jauh dari tertebak. */
export function buatState(): string {
  return acak(32);
}

/** base64url tanpa padding (RFC 7636 §A). */
function base64url(buffer: ArrayBuffer): string {
  const biner = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(biner).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * `code_challenge` = base64url(SHA-256(verifier)) — metode S256.
 *
 * Metode `plain` (mengirim verifier apa adanya sebagai challenge) juga sah
 * menurut RFC dan tidak melindungi apa pun: penyerang yang bisa membaca
 * permintaan pertama sudah memegang verifier-nya.
 */
export async function buatChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
}
