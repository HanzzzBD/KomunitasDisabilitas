// modules/auth — penukaran authorization code Google (PR-017b, PRD FR-1.1).
//
// Alur authorization code + PKCE (RFC 7636), bukan implicit: klien publik
// (web/mobile) mengirim `code` + `code_verifier` ke API kita, dan API-lah yang
// memegang client_secret. Dua akibatnya penting:
// - client_secret tidak pernah ada di perangkat pengguna;
// - `code` yang tersadap di perangkat/jaringan tidak berguna tanpa verifier.
//
// Fungsi ini mengembalikan HANYA id_token. `access_token` dan `refresh_token`
// dari Google tidak diambil, tidak dikembalikan, dan tidak disimpan — kita
// tidak memanggil API Google atas nama pengguna, jadi memegangnya hanya akan
// menambah rahasia yang harus dijaga.
import { appError } from "../../../core/http/index.js";
import type { Logger } from "../../../core/logger/index.js";
import type { FetchLike } from "./fonnte.sender.js";

export interface GoogleTokenExchangeConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  timeoutMs: number;
}

export interface GoogleExchangeInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface GoogleCodeExchange {
  /** Tukar authorization code jadi id_token terverifikasi-nanti. */
  exchange(input: GoogleExchangeInput): Promise<string>;
}

interface GoogleTokenBody {
  id_token?: unknown;
  error?: unknown;
}

/**
 * Kode error OAuth dari Google (mis. `invalid_grant`) — aman untuk log:
 * ia menggambarkan JENIS kegagalan, bukan isi kredensial. `error_description`
 * sengaja TIDAK diambil; ia kadang memuat potongan parameter permintaan.
 */
function bacaKodeError(body: unknown): string {
  if (typeof body !== "object" || body === null) return "tanpa keterangan";
  const error = (body as GoogleTokenBody).error;
  return typeof error === "string" && error.trim() !== ""
    ? error.trim().slice(0, 60)
    : "tanpa keterangan";
}

export function createGoogleCodeExchange(
  config: GoogleTokenExchangeConfig,
  logger: Pick<Logger, "warn">,
  fetchImpl?: FetchLike,
): GoogleCodeExchange {
  const kirim: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));

  return {
    async exchange({ code, codeVerifier, redirectUri }) {
      let response: Response;
      try {
        response = await kirim(config.tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          // `code` & `code_verifier` adalah kredensial sekali pakai: mereka
          // hidup di body permintaan ini saja, tidak pernah di log/URL.
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
            client_id: config.clientId,
            client_secret: config.clientSecret,
          }).toString(),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (err) {
        // Google tak terjangkau = masalah KITA. Menjawab 401 di sini akan
        // menyalahkan pengguna atas gangguan jaringan kita sendiri.
        const jenis = err instanceof Error ? err.name : "Error";
        logger.warn({ jenis }, "Gagal menghubungi token endpoint Google");
        throw appError("BELUM_SIAP", {
          message: "Masuk dengan Google sedang tidak bisa diproses",
          hint: "Coba lagi beberapa saat, atau masuk dengan kode OTP",
        });
      }

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        // Inilah jalur "verifier PKCE salah": Google menjawab 400 dengan
        // `invalid_grant`, sama seperti untuk code kedaluwarsa/terpakai. Kita
        // TIDAK membedakannya untuk pengguna — memberi tahu mana yang salah
        // hanya berguna bagi penebak.
        logger.warn(
          { status: response.status, alasan: bacaKodeError(body) },
          "Google menolak penukaran authorization code",
        );
        throw appError("GOOGLE_EXCHANGE_GAGAL");
      }

      const idToken = (body as GoogleTokenBody | null)?.id_token;
      if (typeof idToken !== "string" || idToken === "") {
        // Balasan 200 tanpa id_token berarti scope `openid` tidak diminta di
        // sisi klien. Itu salah konfigurasi kita, bukan kesalahan pengguna.
        logger.warn({}, "Balasan Google tanpa id_token — periksa scope openid di klien");
        throw appError("GOOGLE_EXCHANGE_GAGAL");
      }

      return idToken;
    },
  };
}
