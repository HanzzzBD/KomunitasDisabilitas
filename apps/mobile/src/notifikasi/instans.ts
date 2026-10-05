import { sesiStore } from "../api";
import { onboardingStore } from "../onboarding/instans";
import { subDariToken } from "../onboarding/koordinator";
import { createKabarNotifikasi } from "./kabar";

export const kabarNotifikasi = createKabarNotifikasi();
function perbarui() {
  const s = sesiStore.getState();
  kabarNotifikasi.akun(s.status === "masuk" ? subDariToken(s.accessToken) : null);
  kabarNotifikasi.aturSiap(s.status === "masuk" && onboardingStore.getState().status === "selesai");
}
sesiStore.subscribe(perbarui);
onboardingStore.subscribe(perbarui);
perbarui();
