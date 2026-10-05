// Klien API mobile + sesi (PR-090). Paket `@nawasena/api-client` (yang menarik
// `@nawasena/schemas`) dipakai apa adanya — tidak ada patch khusus mobile (AC PR-088).
//
// Access token di memori (store sesi); refresh token di SecureStore. 401 →
// refresh single-flight → ulangi sekali, semuanya milik api-client.
import {
  ApiError,
  createApiClient,
  createSessionRefresher,
  logout,
  refreshSesiToleran,
} from "@nawasena/api-client";

import { createSesiStore } from "./auth/sesi";
import { apiBaseUrl } from "./config";
import { tokenStorage } from "./storage/secure-store-adapter";

// Dirujuk lewat fungsi agar klien dan refresher bisa saling membutuhkan.
let refresher: () => Promise<boolean> = async () => false;

export const apiClient = createApiClient({
  baseUrl: apiBaseUrl(),
  getAccessToken: () => sesiStore.getState().accessToken,
  refresh: () => refresher(),
});

export const sesiStore = createSesiStore({
  penyimpanan: tokenStorage,
  async perpanjang(refreshToken) {
    try {
      const { data } = await refreshSesiToleran(apiClient, {
        // Token TERKINI tiap percobaan — rotasi bisa menggantinya di tengah jalan.
        getRefreshToken: async () => (await tokenStorage.getRefreshToken()) ?? refreshToken,
      });
      return { ok: true, accessToken: data.accessToken, refreshToken: data.refreshToken };
    } catch (err) {
      return {
        ok: false,
        sebab: err instanceof ApiError && err.status === 0 ? "jaringan" : "ditolak",
      };
    }
  },
  keluarDiServer: (refreshToken) => logout(apiClient, { refreshToken }),
});

refresher = createSessionRefresher({
  client: apiClient,
  getRefreshToken: () => tokenStorage.getRefreshToken(),
  onRefreshToken: (token) => tokenStorage.setRefreshToken(token),
  onAccessToken: (token) => sesiStore.getState().gantiAccessToken(token),
  onSessionEnded: () => sesiStore.getState().sesiBerakhir(),
});
