import { createApiClient, registerMyDevice, unregisterMyDevice } from "@nawasena/api-client";

import { sesiStore, pasangPelepasPush } from "../api";
import { apiBaseUrl } from "../config";
import { subDariToken } from "../onboarding/koordinator";
import { cabutTokenFcm, tokenFcm } from "./android";
import { createRegistrasiPush } from "./registrasi";
import { denganBatas } from "./batas-waktu";

function klienPerangkat() {
  const token = sesiStore.getState().accessToken;
  return createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: () => token });
}

export const registrasiPush = createRegistrasiPush({
  token: (mintaIzin) => denganBatas(() => tokenFcm(mintaIzin), mintaIzin ? 60_000 : 5000),
  daftar: (fcmToken) =>
    denganBatas((signal) =>
      registerMyDevice(klienPerangkat(), { fcmToken, platform: "android" }, signal),
    ),
  lepas: (id) => {
    // Tanpa hook refresh: sesi kedaluwarsa tidak boleh memicu pelepasan rekursif.
    return denganBatas((signal) => unregisterMyDevice(klienPerangkat(), id, signal));
  },
  cabutToken: () => denganBatas(cabutTokenFcm),
});
pasangPelepasPush(() => registrasiPush.lepas());
sesiStore.subscribe((s) =>
  registrasiPush.akun(s.status === "masuk" ? subDariToken(s.accessToken) : null),
);
