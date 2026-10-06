import { useEffect, useRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router";
import type { UserRole } from "@nawasena/schemas";
import { useTeks, type KunciTeks } from "../shared/i18n/index.js";
import { KeluarAkun } from "./keluar-akun.js";
import { LencanaNotifikasi } from "./lencana-notifikasi.js";
import { AksesibilitasCepat } from "./aksesibilitas-cepat.js";
import { IkonNavigasi, type NamaIkon } from "./ikon-navigasi.js";

interface Tautan {
  ke: string;
  kunci: KunciTeks;
  ikon?: NamaIkon;
  tepat?: boolean;
}
const PUBLIK: readonly Tautan[] = [
  { ke: "/lowongan", kunci: "shell.nav.lowongan", ikon: "lowongan" },
  { ke: "/community", kunci: "shell.nav.community" },
  { ke: "/kamus", kunci: "shell.pintas.kamus" },
];
export const NAVIGASI_SEEKER: readonly Tautan[] = [
  { ke: "/home", kunci: "shell.nav.beranda", ikon: "beranda" },
  { ke: "/lowongan", kunci: "shell.nav.lowongan", ikon: "lowongan" },
  { ke: "/lamaran", kunci: "shell.nav.lamaran", ikon: "lamaran" },
  { ke: "/cv", kunci: "shell.nav.cv", ikon: "cv" },
  { ke: "/profil", kunci: "shell.nav.profil", ikon: "profil" },
];

function Merek({ ke }: { ke: string }) {
  const t = useTeks();
  return (
    <Link to={ke} className="shell-brand" aria-label={t("shell.merek")}>
      <span className="shell-brand-mark" aria-hidden="true">
        N
      </span>
      <span className="text-xl font-semibold">{t("shell.merek")}</span>
    </Link>
  );
}

function TautanMenu({ daftar }: { daftar: readonly Tautan[] }) {
  const t = useTeks();
  const { pathname } = useLocation();
  return (
    <ul>
      {daftar.map(({ ke, kunci, ikon, tepat }) => (
        <li key={ke}>
          <NavLink
            to={ke === "/home" && pathname === "/" ? "/" : ke}
            end={ke === "/home" && pathname === "/" ? true : tepat}
            aria-label={kunci === "shell.nav.cv" ? t(kunci) : undefined}
            className="shell-nav-link"
          >
            {ikon && <IkonNavigasi nama={ikon} />}
            <span>
              {kunci === "shell.nav.cv" ? (
                <>
                  <span className="shell-cv-desktop">{t(kunci)}</span>
                  <span className="shell-cv-mobile">CV</span>
                </>
              ) : (
                t(kunci)
              )}
            </span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function MenuAkun() {
  const t = useTeks();
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const [terbuka, setTerbuka] = useState(false);
  useEffect(() => {
    setTerbuka(false);
  }, [pathname]);
  useEffect(() => {
    const tutupDiLuar = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setTerbuka(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && terbuka) {
        setTerbuka(false);
        ref.current?.querySelector("button")?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("pointerdown", tutupDiLuar);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", tutupDiLuar);
      document.removeEventListener("keydown", escape);
    };
  }, [terbuka]);
  return (
    <div className="shell-account" ref={ref}>
      <button
        type="button"
        className="shell-tool text-sm"
        aria-expanded={terbuka}
        aria-controls="menu-akun"
        onClick={() => setTerbuka((v) => !v)}
      >
        <IkonNavigasi nama="profil" />
        {t("shell.nav.akunMenu")}
      </button>
      {terbuka && (
        <nav id="menu-akun" aria-label={t("shell.nav.akunMenu")} className="shell-account-links">
          <NavLink className="shell-tool" to="/pengaturan">
            {t("shell.nav.akun")}
          </NavLink>
          <NavLink className="shell-tool" to="/help">
            {t("shell.nav.bantuan")}
          </NavLink>
          <NavLink className="shell-tool" to="/community">
            {t("shell.nav.community")}
          </NavLink>
          <NavLink className="shell-tool" to="/kamus">
            {t("shell.pintas.kamus")}
          </NavLink>
          <KeluarAkun />
        </nav>
      )}
    </div>
  );
}

export function NavigasiWeb({ masuk, peran }: { masuk: boolean; peran: UserRole | null }) {
  const t = useTeks();
  const { pathname } = useLocation();
  const karier =
    peran === "seeker" &&
    !["/masuk", "/onboarding"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  useEffect(() => {
    const nav = document.querySelector(".shell-primary");
    if (!nav || typeof ResizeObserver === "undefined") return;
    const perbarui = () =>
      document.documentElement.style.setProperty(
        "--bottom-nav-height",
        `${nav.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(perbarui);
    observer.observe(nav);
    perbarui();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--bottom-nav-height");
    };
  }, [karier]);
  const beranda = peran === "admin" ? "/admin" : karier ? "/home" : "/";
  const judul = pathname.startsWith("/admin")
    ? "shell.nav.admin"
    : pathname.startsWith("/lowongan")
      ? "shell.nav.lowongan"
      : pathname.startsWith("/lamaran")
        ? "shell.nav.lamaran"
        : pathname.startsWith("/cv")
          ? "shell.nav.cv"
          : pathname.startsWith("/profil")
            ? "shell.nav.profil"
            : pathname === "/notifikasi"
              ? "shell.notifikasi.lencanaKosong"
              : pathname.startsWith("/pengaturan")
                ? "shell.nav.akun"
                : pathname.startsWith("/community")
                  ? "shell.nav.community"
                  : pathname.startsWith("/kamus")
                    ? "shell.pintas.kamus"
                    : pathname === "/help"
                      ? "shell.nav.bantuan"
                      : "shell.nav.beranda";
  return (
    <>
      {karier && (
        <aside className="shell-sidebar">
          <div className="shell-sidebar-brand">
            <Merek ke={beranda} />
            <p className="text-sm">{t("shell.peran.seeker")}</p>
          </div>
          <nav aria-label="Navigasi utama" className="shell-primary">
            <TautanMenu daftar={NAVIGASI_SEEKER} />
          </nav>
          <nav aria-label={t("shell.nav.pendukung")} className="shell-utilities">
            <TautanMenu
              daftar={[
                {
                  ke: "/pengaturan/aksesibilitas",
                  kunci: "shell.nav.aksesibilitas",
                  ikon: "aksesibilitas",
                },
                { ke: "/help", kunci: "shell.nav.bantuan", ikon: "bantuan" },
              ]}
            />
          </nav>
        </aside>
      )}
      <header className="shell-header">
        <div className="shell-header-inner">
          <div className="shell-topbar">
            {karier ? (
              <p className="shell-page-label text-lg font-semibold">{t(judul)}</p>
            ) : (
              <Merek ke={beranda} />
            )}
            <div className="shell-tools">
              {masuk ? (
                <>
                  <LencanaNotifikasi />
                  <AksesibilitasCepat />
                  <MenuAkun />
                </>
              ) : (
                <Link to="/masuk" className="shell-login text-base font-semibold">
                  {t("shell.aksi.masuk")}
                </Link>
              )}
            </div>
          </div>
          {!karier && (
            <nav aria-label={t("shell.nav.publik")} className="shell-navigation">
              <TautanMenu
                daftar={
                  peran === "admin"
                    ? [{ ke: "/admin", kunci: "shell.nav.admin" }, ...PUBLIK]
                    : PUBLIK
                }
              />
            </nav>
          )}
        </div>
      </header>
    </>
  );
}
