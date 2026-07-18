// Base client Incasif — fetch + envelope + hook refresh 401 (ADR-014, SDD §11).
//
// TANPA dependensi DOM/Node-spesifik: fetch di-inject (default globalThis.fetch)
// sehingga jalan di browser, React Native, dan Node ≥ 18.
// Penyimpanan token DI LUAR paket ini (web: cookie; mobile: SecureStore) —
// client hanya memanggil getAccessToken() saat menyusun header, dan token
// tidak pernah di-log atau disertakan pada objek error.
import type { z } from "zod";
import { ApiError, JARINGAN_GAGAL, RESPONS_TIDAK_DIKENAL, toErrorEnvelope } from "./errors.js";

export interface ApiClientOptions {
  /** Contoh: "https://incasif.id/api/v1" (tanpa trailing slash). */
  baseUrl: string;
  /** Ambil access token saat ini; null = request tanpa Authorization. */
  getAccessToken?: () => string | null | Promise<string | null>;
  /**
   * Hook refresh saat 401: kembalikan true bila token baru siap → request
   * di-retry SEKALI. STUB sampai PR-018 — default selalu false.
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
  responseSchema?: z.ZodType<TResponse>;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<TResponse = unknown>(
    path: string,
    options?: RequestOptions<TResponse>,
  ): Promise<TResponse>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const refresh = options.refresh ?? (() => false);

  async function doFetch(path: string, init: RequestOptions<unknown>): Promise<Response> {
    const headers: Record<string, string> = { accept: "application/json" };
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
    if (response.status === 401 && (await refresh())) {
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

  return { request };
}
