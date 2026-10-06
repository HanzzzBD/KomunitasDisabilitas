import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  applicationsKeys,
  getMe,
  getProfile,
  listMyApplications,
  listResumes,
  profilesKeys,
  resumesKeys,
  usersKeys,
  type ApiClient,
} from "@nawasena/api-client";
import { useTeks } from "../../shared/i18n/index.js";
import { StatusLamaranBadge } from "../applications/status-lamaran.js";

export function RingkasanBeranda({ klien, sub }: { klien: ApiClient; sub: string | null }) {
  const t = useTeks();
  const akun = useQuery({ queryKey: usersKeys.me(), queryFn: () => getMe(klien) });
  const profil = useQuery({ queryKey: profilesKeys.me(sub), queryFn: () => getProfile(klien) });
  const cv = useQuery({ queryKey: resumesKeys.list(sub), queryFn: () => listResumes(klien) });
  const lamaran = useQuery({
    queryKey: [...applicationsKeys.myList(sub), "ringkasan"],
    queryFn: () => listMyApplications(klien, { limit: 3 }),
  });
  const terisi = profil.data
    ? [profil.data.headline, profil.data.summary, profil.data.city, profil.data.province].filter(
        (v) => v?.trim(),
      ).length
    : null;
  return (
    <>
      <p className="text-xl font-semibold">
        {t("beranda.personal.salam", { nama: akun.data?.data.fullName || t("shell.merek") })}
      </p>
      <div className="home-summary">
        <section className="page-panel flex flex-col gap-3" aria-labelledby="home-profile-title">
          <h2 id="home-profile-title" className="text-xl font-semibold">
            {t("beranda.personal.profil")}
          </h2>
          {terisi !== null ? (
            <>
              <p className="text-base">{t("beranda.personal.progress", { jumlah: terisi })}</p>
              <progress
                max="4"
                value={terisi}
                aria-label={t("beranda.personal.profil")}
                className="w-full"
              />
            </>
          ) : (
            <p role={profil.isError ? "alert" : "status"}>
              {t(profil.isError ? "beranda.personal.gagal" : "shell.memuat")}
            </p>
          )}
          <Link to="/profil" className="shell-nav-link underline">
            {t("beranda.personal.lengkapi")}
          </Link>
        </section>
        <section className="page-panel flex flex-col gap-3" aria-labelledby="home-cv-title">
          <h2 id="home-cv-title" className="text-xl font-semibold">
            {t("shell.nav.cv")}
          </h2>
          <p role={cv.isError ? "alert" : undefined}>
            {t(
              cv.isError
                ? "beranda.personal.gagal"
                : cv.data
                  ? "beranda.personal.cvJumlah"
                  : "shell.memuat",
              { jumlah: cv.data?.length ?? 0 },
            )}
          </p>
          <Link to="/cv" className="shell-nav-link underline">
            {t("beranda.personal.siapkanCv")}
          </Link>
        </section>
      </div>
      <section className="page-panel flex flex-col gap-3" aria-labelledby="home-applications-title">
        <h2 id="home-applications-title" className="text-xl font-semibold">
          {t("beranda.personal.lamaran")}
        </h2>
        {lamaran.isPending && <p role="status">{t("shell.memuat")}</p>}
        {lamaran.isError && <p role="alert">{t("beranda.personal.gagal")}</p>}
        {lamaran.data?.data.length === 0 && <p>{t("beranda.personal.belumLamaran")}</p>}
        <ul className="flex flex-col gap-2">
          {lamaran.data?.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3">
              <Link to={`/lamaran/${a.id}`} className="shell-nav-link underline">
                {a.job?.title ?? t("beranda.personal.detailLamaran")}
              </Link>
              <StatusLamaranBadge status={a.status} />
            </li>
          ))}
        </ul>
        <Link to="/lamaran" className="shell-nav-link underline">
          {t("beranda.personal.semuaLamaran")}
        </Link>
      </section>
    </>
  );
}
