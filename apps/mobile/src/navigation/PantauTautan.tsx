import { createNavigationContainerRef } from "@react-navigation/native";
import type { NotificationResponse } from "expo-notifications";
import { useEffect } from "react";
import { AppState, Linking } from "react-native";
import { useStore } from "zustand";

import { sesiStore } from "../api";
import { onboardingStore } from "../onboarding/instans";
import { subDariToken } from "../onboarding/koordinator";
import { notificationsAndroid } from "../push/android";
import { registrasiPush } from "../push/instans";
import { kabarNotifikasi } from "../notifikasi/instans";
import { kunciDaftar, kunciTerbaru } from "../notifikasi/kunci";
import { queryClient } from "../query";
import { createAntreanTautan } from "./antrean-tautan";
import type { RootNavigatorParamList } from "./types";
import { tujuanStack } from "./tujuan-stack";

export const navigationRef = createNavigationContainerRef<RootNavigatorParamList>();
export const antreanTautan = createAntreanTautan((t) => {
  navigationRef.navigate("Utama", tujuanStack(t));
});

export function perbaruiKesiapanTautan() {
  // Stack login/wizard bisa masih terpasang pada commit transisi sesi.
  // Tunggu layar tujuan terdaftar, agar action tidak ditolak lalu antrean hilang.
  antreanTautan.aturSiap(
    navigationRef.isReady() &&
      navigationRef.getRootState()?.routeNames.includes("Utama") === true &&
      sesiStore.getState().status === "masuk" &&
      onboardingStore.getState().status === "selesai",
  );
}

/** Tetap terpasang selama pemulihan sesi, login, dan onboarding. */
export function PantauTautan() {
  const status = useStore(sesiStore, (s) => s.status);
  const onboarding = useStore(onboardingStore, (s) => s.status);
  useEffect(() => {
    perbaruiKesiapanTautan();
  }, [status, onboarding]);
  useEffect(() => {
    const berhenti = sesiStore.subscribe((s, lama) => {
      if (lama.status === "masuk" && s.status === "keluar") antreanTautan.hapus();
      perbaruiKesiapanTautan();
    });
    const berhentiOnboarding = onboardingStore.subscribe(perbaruiKesiapanTautan);
    let batal = false;
    let urutan = 0;
    const urlSub = Linking.addEventListener("url", ({ url }) => {
      urutan++;
      antreanTautan.url(url);
    });
    const awal = urutan;
    void Linking.getInitialURL()
      .then((url) => {
        if (!batal && urutan === awal && url) antreanTautan.url(url);
      })
      .catch(() => undefined);
    const subscriptions: Array<{ remove(): void }> = [];
    void notificationsAndroid()
      .then(async (n) => {
        if (!n || batal) return;
        // Foreground hanya banner in-app, tanpa suara/tray/banner OS kedua.
        n.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          }),
        });
        subscriptions.push(
          n.addNotificationReceivedListener((notification) => {
            if (!kabarNotifikasi.push(notification.request.content.data)) return;
            const sub = kabarNotifikasi.store.getState().sub;
            void queryClient.invalidateQueries({ queryKey: kunciTerbaru(sub) });
            if (sub)
              kunciDaftar(sub).forEach((queryKey) => {
                void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
              });
          }),
        );
        const tangani = (r: NotificationResponse) => {
          if (r.actionIdentifier !== n.DEFAULT_ACTION_IDENTIFIER) return;
          antreanTautan.push(
            `${r.notification.request.identifier}:${r.actionIdentifier}`,
            r.notification.request.content.data,
          );
          void n.clearLastNotificationResponseAsync().catch(() => undefined);
        };
        let eventPush = 0;
        subscriptions.push(
          n.addNotificationResponseReceivedListener((r) => {
            eventPush++;
            tangani(r);
          }),
        );
        const terakhir = await n.getLastNotificationResponseAsync();
        if (!batal && eventPush === 0 && terakhir) tangani(terakhir);
        if (batal) return;
        subscriptions.push(
          n.addPushTokenListener(() => {
            void registrasiPush.daftarkan(false).catch(() => undefined);
          }),
        );
      })
      .catch(() => undefined);
    const appSub = AppState.addEventListener("change", (s) => {
      kabarNotifikasi.aturAktif(s === "active");
      const queryKey = kunciTerbaru(kabarNotifikasi.store.getState().sub);
      if (s === "active") void queryClient.invalidateQueries({ queryKey });
      else void queryClient.cancelQueries({ queryKey });
      if (s === "active") void registrasiPush.daftarkan(false).catch(() => undefined);
    });
    kabarNotifikasi.aturAktif(AppState.currentState === "active");
    return () => {
      batal = true;
      berhenti();
      berhentiOnboarding();
      urlSub.remove();
      appSub.remove();
      subscriptions.forEach((s) => s.remove());
    };
  }, []);
  useEffect(() => {
    if (status !== "masuk") return;
    registrasiPush.akun(subDariToken(sesiStore.getState().accessToken));
    void registrasiPush.daftarkan(false).catch(() => undefined);
  }, [status]);
  return null;
}
