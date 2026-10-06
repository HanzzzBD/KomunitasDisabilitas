import { Link } from "react-router";
import { useKlienApi } from "../app/klien-api.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useIdentitasAdmin } from "../features/admin/community-shared.js";
import { DaftarCommunityAdmin } from "../features/admin/community-daftar.js";
import { MetrikCommunity } from "../features/admin/community-metrik.js";
export function AdminCommunity({ laporan = false }: { laporan?: boolean }) {
  const t = useTeks();
  const klien = useKlienApi();
  const userId = useIdentitasAdmin(klien);
  const title = t(laporan ? "admin.community.queue" : "admin.community.judul");
  useJudulHalaman(t("shell.judulDokumen", { halaman: title }));
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p>{t("admin.community.privacy")}</p>
      <div className="flex flex-wrap gap-4">
        <Link
          className="min-h-sentuh inline-flex items-center underline"
          to={laporan ? "/admin/community" : "/admin/community/laporan"}
        >
          {t(laporan ? "admin.community.judul" : "admin.community.queue")}
        </Link>
        {!laporan ? (
          <Link
            className="min-h-sentuh inline-flex items-center underline"
            to="/admin/community/ruang/baru"
          >
            {t("admin.community.baru")}
          </Link>
        ) : null}
      </div>
      {userId ? (
        <>
          {!laporan ? <MetrikCommunity klien={klien} userId={userId} /> : null}
          <DaftarCommunityAdmin klien={klien} userId={userId} laporan={laporan} />
        </>
      ) : (
        <p role="status">{t("admin.community.memuat")}</p>
      )}
    </div>
  );
}
export function AdminCommunityQueue() {
  return <AdminCommunity laporan />;
}
