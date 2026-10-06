import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useTeks } from "../shared/i18n/index.js";

export function Breadcrumb() {
  const { pathname } = useLocation();
  const t = useTeks();
  const [judul, setJudul] = useState("");
  const segmen = pathname.split("/").filter(Boolean);
  const induk = segmen[0];
  const kunci =
    induk === "lowongan"
      ? "shell.nav.lowongan"
      : induk === "lamaran"
        ? "shell.nav.lamaran"
        : induk === "cv"
          ? "shell.nav.cv"
          : null;
  useEffect(() => {
    const main = document.getElementById("konten-utama");
    if (!main) return;
    const perbarui = () => setJudul(main.querySelector("h1")?.textContent ?? "");
    perbarui();
    const observer = new MutationObserver(perbarui);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname]);
  if (!kunci || segmen.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="shell-breadcrumb text-sm">
      <ol>
        <li>
          <Link to={`/${induk}`}>{t(kunci)}</Link>
        </li>
        <li>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{judul}</span>
        </li>
      </ol>
    </nav>
  );
}
