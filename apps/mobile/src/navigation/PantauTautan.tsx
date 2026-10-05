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
import { createAntreanTautan } from "./antrean-tautan";
import type { RootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
export const antreanTautan = createAntreanTautan((t) => {
  if (t.layar === "Utama") navigationRef.navigate("Utama", { screen: t.tab });
  else {
    navigationRef.navigate(t.layar, { id: t.id });
  }
});

export function perbaruiKesiapanTautan() {
  // Stack login/wizard bisa masih terpasang pada commit transisi sesi.
  // Tunggu layar tujuan terdaftar, agar action tidak ditolak lalu antrean hilang.
  antreanTautan.aturSiap(
    navigationRef.isReady() &&
      navigationRef.getRootState()?.routeNames.includes("LamaranDetail") === true &&
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
        // Foreground belum menampilkan push OS; banner dalam app = PR-095.
        n.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          }),
        });
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
      if (s === "active") void registrasiPush.daftarkan(false).catch(() => undefined);
    });
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
