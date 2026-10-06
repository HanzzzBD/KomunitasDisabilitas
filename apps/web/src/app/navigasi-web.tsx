import { NavLink, Link } from "react-router";
import type { UserRole } from "@nawasena/schemas";
import { useTeks, type KunciTeks } from "../shared/i18n/index.js";
import { LencanaNotifikasi } from "./lencana-notifikasi.js";

interface Tautan {
  ke: string;
  kunci: KunciTeks;
  tepat?: boolean;
}

const PUBLIK: readonly Tautan[] = [
  { ke: "/lowongan", kunci: "shell.nav.lowongan" },
  { ke: "/kamus", kunci: "shell.pintas.kamus" },
];
const SEEKER: readonly Tautan[] = [
  { ke: "/", kunci: "shell.nav.beranda", tepat: true },
  { ke: "/lowongan", kunci: "shell.nav.lowongan" },
  { ke: "/lamaran", kunci: "shell.pintas.lamaran" },
  { ke: "/cv", kunci: "shell.pintas.cv" },
  { ke: "/profil", kunci: "shell.pintas.profil" },
  { ke: "/kamus", kunci: "shell.pintas.kamus" },
];
const ADMIN: readonly Tautan[] = [
  { ke: "/admin", kunci: "shell.nav.admin" },
  { ke: "/lowongan", kunci: "shell.nav.lowonganPublik" },
  { ke: "/kamus", kunci: "shell.nav.kamusPublik" },
];

export function NavigasiWeb({ masuk, peran }: { masuk: boolean; peran: UserRole | null }) {
  const t = useTeks();
  const tautan = peran === "admin" ? ADMIN : peran === "seeker" ? SEEKER : PUBLIK;
  const beranda = peran === "admin" ? "/admin" : "/";
  const labelPeran =
    peran === "admin"
      ? "shell.peran.admin"
      : peran === "seeker"
        ? "shell.peran.seeker"
        : peran === "employer"
          ? "shell.peran.employer"
          : "shell.beranda.tagline";

  return (
    <header className="shell-header">
      <div className="shell-header-inner">
        <div className="shell-topbar">
          <Link to={beranda} className="shell-brand" aria-label={t("shell.merek")}>
            <span className="shell-brand-mark" aria-hidden="true">
              N
            </span>
            <span className="text-xl font-semibold">{t("shell.merek")}</span>
          </Link>
          <p className={`shell-context text-sm ${peran === null ? "shell-context-public" : ""}`}>
            {t(labelPeran)}
          </p>
          <div className="shell-tools">
            {masuk ? (
              <>
                <LencanaNotifikasi />
                <NavLink to="/pengaturan" end className="shell-tool text-sm">
                  {t("shell.nav.akun")}
                </NavLink>
                <NavLink to="/pengaturan/aksesibilitas" className="shell-tool text-sm">
                  {t("shell.pintas.aksesibilitas")}
                </NavLink>
              </>
            ) : (
              <Link to="/masuk" className="shell-login text-base font-semibold">
                {t("shell.aksi.masuk")}
              </Link>
            )}
          </div>
        </div>
        <nav
          aria-label={t(masuk ? "shell.pintas.label" : "shell.nav.publik")}
          className="shell-navigation"
        >
          <ul>
            {tautan.map(({ ke, kunci, tepat }) => (
              <li key={ke}>
                <NavLink to={ke} end={tepat} className="shell-nav-link text-base">
                  {t(kunci)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
