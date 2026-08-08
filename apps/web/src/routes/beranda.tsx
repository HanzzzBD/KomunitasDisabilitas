// Halaman "/" — sementara. Landing sesungguhnya (nilai produk, CTA, SEO) lahir
// di PR-032; yang ada di sini hanya cukup untuk membuktikan route termuat lazy.
import { Link } from "react-router";
import { useTeks } from "../shared/i18n/index.js";

export function Beranda() {
  const t = useTeks();

  return (
    <main>
      <h1>{t("shell.merek")}</h1>
      <p>{t("shell.beranda.tagline")}</p>
      {/* <Link>, bukan <a href>: navigasi dalam aplikasi tidak boleh memuat
          ulang seluruh halaman — pemuatan ulang membuang fokus keyboard dan
          memaksa screen reader membacakan halaman dari awal. */}
      <Link to="/masuk">{t("shell.aksi.masuk")}</Link>
    </main>
  );
}
