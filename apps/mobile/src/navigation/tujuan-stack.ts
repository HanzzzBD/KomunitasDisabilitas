import type { TujuanTautan } from "./deep-link";
import type { TabParamList } from "./types";
import type { NavigatorScreenParams } from "@react-navigation/native";

/** Preserve legacy deep links/push payloads while delivering to a tab's stack. */
export function tujuanStack(t: TujuanTautan): NavigatorScreenParams<TabParamList> {
  if (t.layar === "Utama") return { screen: t.tab };
  if (t.layar === "Notifikasi")
    return { screen: "Beranda", params: { screen: "Notifikasi", initial: false } };
  if (t.layar === "CvChat") return { screen: "Cv", params: { screen: "CvChat", initial: false } };
  if (t.layar === "LamaranDetail")
    return {
      screen: "Lamaran",
      params: { screen: "LamaranDetail", params: { id: t.id }, initial: false },
    };
  if (t.layar === "CvEditor")
    return { screen: "Cv", params: { screen: "CvEditor", params: { id: t.id }, initial: false } };
  return {
    screen: "Cari",
    params: { screen: "LowonganDetail", params: { id: t.id }, initial: false },
  };
}
