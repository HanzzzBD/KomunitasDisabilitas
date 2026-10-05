import AsyncStorage from "@react-native-async-storage/async-storage";

import { createAnalitik } from "./klien";

export const analitik = createAnalitik({
  storage: AsyncStorage,
  fetch: globalThis.fetch,
  url: process.env.EXPO_PUBLIC_UMAMI_URL,
  websiteId: process.env.EXPO_PUBLIC_UMAMI_WEBSITE_ID,
});
export const analitikSiap = analitik.mulai();
export const track = analitik.track;
export const sekaliSaja = analitik.sekaliSaja;
