// Base client Nawasena — fetch + envelope + hook refresh 401 (ADR-014, SDD §11).
//
// TANPA dependensi DOM/Node-spesifik: fetch di-inject (default globalThis.fetch)
// sehingga jalan di browser, React Native, dan Node ≥ 18.
// Penyimpanan token DI LUAR paket ini (web: cookie; mobile: SecureStore) —
// client hanya memanggil getAccessToken() saat menyusun header, dan token
// tidak pernah di-log atau disertakan pada objek error.
import type { z } from "zod";
import { ApiError, JARINGAN_GAGAL, RESPONS_TIDAK_DIKENAL, toErrorEnvelope } from "./errors.js";

export interface ApiClientOptions {
  /** Contoh: "https://nawasena.id/api/v1" (tanpa trailing slash). */
  baseUrl: string;
  /** Ambil access token saat ini; null = request tanpa Authorization. */
  getAccessToken?: () => string | null | Promise<string | null>;
  /**
   * Hook refresh saat 401: kembalikan true bila token baru siap → request
   * di-retry SEKALI. Pakai `createSessionRefresher` (PR-018b) — ia
   * men-single-flight panggilan refresh, yang WAJIB karena refresh token
   * bersifat rotating. Default: selalu false (tanpa sesi, 401 diteruskan).
   */
  refresh?: () => boolean | Promise<boolean>;
  /** Override fetch (test/polyfill). Default: globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions<TResponse> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Body akan di-JSON.stringify. Validasi zod dilakukan di lapisan endpoint. */
  body?: unknown;
  /** Skema response; bila diberikan, response diparse (guard drift runtime). */
  responseSchema?: z.ZodType<TResponse, z.ZodTypeDef, unknown>;
  /**
   * Header tambahan (PR-078: `Idempotency-Key` saat melamar). `accept`,
   * `content-type`, dan `authorization` tetap ditentukan klien — header di sini
   * tidak bisa menimpanya.
   */
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  /**
   * Jangan jalankan hook refresh pada 401 permintaan ini.
   *
   * WAJIB untuk permintaan /auth/refresh itu sendiri: tanpa ini, refresh yang
   * ditolak 401 akan memicu hook refresh lagi — dan karena hook-nya
   * single-flight, ia menunggu panggilan yang sedang berjalan, yaitu dirinya
   * sendiri. Hasilnya deadlock (tanpa single-flight: rekursi tak berujung).
   */
  skipAuthRefresh?: boolean;
}

/** Opsi permintaan ber-aliran (SSE) — PR-068. */
export interface StreamOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Header tambahan, mis. `last-event-id` saat menyambung ulang. */
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<TResponse = unknown>(
    path: string,
    options?: RequestOptions<TResponse>,
  ): Promise<TResponse>;
  /**
   * Permintaan yang jawabannya DIBACA SENDIRI oleh pemanggil (SSE, PR-068).
   *
   * Auth dan refresh-401 SAMA dengan `request` — keduanya terjadi sebelum satu
   * byte badan dibaca, jadi aman diulang. Status non-2xx dilempar sebagai
   * `ApiError` ber-envelope (server menjawab JSON sebelum aliran dibuka); 2xx
   * dikembalikan apa adanya, badannya belum disentuh.
   *
   * OPSIONAL dengan sengaja: puluhan klien palsu di test hanya punya `request`,
   * dan hanya fitur chat yang membutuhkan aliran. Endpoint yang memakainya
   * menolak dengan jelas bila klien tidak menyediakannya.
   */
  stream?(path: string, options?: StreamOptions): Promise<Response>;
  /** Berkas privat: pemeriksaan sesi/refresh yang sama, respons biner belum dibaca. */
  download?(path: string, signal?: AbortSignal): Promise<Response>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const refresh = options.refresh ?? (() => false);

  async function doFetch(
    path: string,
    init: RequestOptions<unknown> & { accept?: string },
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init.headers ?? {}),
      accept: init.accept ?? "application/json",
    };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const token = (await options.getAccessToken?.()) ?? null;
    if (token !== null) headers.authorization = `Bearer ${token}`;

    try {
      return await fetchImpl(`${options.baseUrl}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: init.signal,
      });
    } catch {
      // fetch reject = tidak pernah sampai server. Detail teknis tidak dibawa
      // ke pengguna (dan tidak memuat header/token).
      throw new ApiError(JARINGAN_GAGAL, 0);
    }
  }

  async function request<TResponse>(
    path: string,
    reqOptions: RequestOptions<TResponse> = {},
  ): Promise<TResponse> {
    let response = await doFetch(path, reqOptions);

    // 401 → refresh sekali → retry sekali. 401 kedua lolos ke error biasa.
    if (response.status === 401 && reqOptions.skipAuthRefresh !== true && (await refresh())) {
      response = await doFetch(path, reqOptions);
    }

    const body: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new ApiError(toErrorEnvelope(body), response.status);
    }
    if (reqOptions.responseSchema) {
      const parsed = reqOptions.responseSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(RESPONS_TIDAK_DIKENAL, response.status);
      return parsed.data;
    }
    return body as TResponse;
  }

  async function stream(path: string, streamOptions: StreamOptions = {}): Promise<Response> {
    const init = { ...streamOptions, accept: "text/event-stream" };
    let response = await doFetch(path, init);
    if (response.status === 401 && (await refresh())) {
      response = await doFetch(path, init);
    }
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => undefined);
      throw new ApiError(toErrorEnvelope(body), response.status);
    }
    return response;
  }

  async function download(path: string, signal?: AbortSignal): Promise<Response> {
    const init = { accept: "application/pdf", signal };
    let response = await doFetch(path, init);
    if (response.status === 401 && (await refresh())) response = await doFetch(path, init);
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => undefined);
      throw new ApiError(toErrorEnvelope(body), response.status);
    }
    return response;
  }

  return { request, stream, download };
}
