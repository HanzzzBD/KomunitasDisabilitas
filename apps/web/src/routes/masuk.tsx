// Halaman "/masuk" — kerangka. Form OTP, tombol Google, dan route guard lahir
// di PR-030. Jalur URL-nya sudah pasti sejak sekarang: `/masuk/google` adalah
// redirect URI yang terdaftar di Google Cloud Console.
import { useTeks } from "../shared/i18n/index.js";

export function Masuk() {
  const t = useTeks();

  return (
    <main>
      <h1>{t("shell.masuk.judul")}</h1>
      <p>{t("shell.masuk.sedangDisiapkan")}</p>
    </main>
  );
}
