import type { TujuanTautan } from "./deep-link";
import type { TabParamList, EmployerStackParamList } from "./types";
import type { UserRole } from "@nawasena/schemas";
import type { NavigatorScreenParams } from "@react-navigation/native";

/** Preserve legacy deep links/push payloads while delivering to a tab's stack. */
export function tujuanStack(
  t: TujuanTautan,
  role: UserRole = "seeker",
): NavigatorScreenParams<TabParamList> | NavigatorScreenParams<EmployerStackParamList> {
  if (role === "employer") return { screen: t.layar === "Notifikasi" ? "Notifikasi" : "Employer" };
  if (t.layar === "Employer")
    return { screen: "Profil", params: { screen: "Employer", initial: false } };
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
