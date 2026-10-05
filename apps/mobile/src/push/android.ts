import Constants from "expo-constants";

// Modul natif hanya dimuat bila Firebase siap. Alur lamar/tracking tetap bisa
// diuji sebelum konfigurasi push ditambahkan.
export const pushConfigure = Constants.expoConfig?.extra?.pushConfigure === true;

export async function notificationsAndroid() {
  return pushConfigure ? import("expo-notifications") : null;
}

export async function tokenFcm(mintaIzin: boolean): Promise<string | null> {
  const n = await notificationsAndroid();
  if (!n) throw new Error("PUSH_BELUM_SIAP");
  // Channel dibuat SEBELUM permintaan izin Android 13+ (Expo Notifications).
  await n.setNotificationChannelAsync("lamaran", {
    name: "Perkembangan lamaran",
    importance: n.AndroidImportance.DEFAULT,
    lockscreenVisibility: n.AndroidNotificationVisibility.PRIVATE,
  });
  const izin = await n.getPermissionsAsync();
  const hasil =
    izin.granted || !mintaIzin || !izin.canAskAgain ? izin : await n.requestPermissionsAsync();
  if (!hasil.granted) return null;
  const token = await n.getDevicePushTokenAsync();
  return token.type === "android" && typeof token.data === "string" ? token.data : null;
}

export async function cabutTokenFcm(): Promise<void> {
  const n = await notificationsAndroid();
  if (n) {
    await n.unregisterForNotificationsAsync();
    await n.dismissAllNotificationsAsync();
    await n.clearLastNotificationResponseAsync();
  }
}
