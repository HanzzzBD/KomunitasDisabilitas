import { Link } from "react-router";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

export function Bantuan() {
  const t = useTeks();
  useJudulHalaman(t("shell.judulDokumen", { halaman: t("shell.nav.bantuan") }));
  return (
    <div className="page-frame page-panel flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t("shell.nav.bantuan")}</h1>
      {(
        [
          ["shell.help.pekerjaan", "/lowongan", "shell.nav.lowongan"],
          ["shell.help.lamaran", "/lamaran", "shell.nav.lamaran"],
          ["shell.help.cv", "/cv", "shell.nav.cv"],
          ["shell.help.aksesibilitas", "/pengaturan/aksesibilitas", "shell.nav.aksesibilitas"],
        ] as const
      ).map(([isi, ke, label]) => (
        <section key={ke} className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{t(label)}</h2>
          <p className="text-base">{t(isi)}</p>
          <Link to={ke} className="shell-nav-link underline">
            {t(label)}
          </Link>
        </section>
      ))}
      <nav aria-label={t("shell.nav.pendukung")}>
        <Link to="/community" className="shell-nav-link">
          {t("shell.nav.community")}
        </Link>
        <Link to="/kamus" className="shell-nav-link">
          {t("shell.pintas.kamus")}
        </Link>
      </nav>
    </div>
  );
}
