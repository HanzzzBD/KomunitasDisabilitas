// Halaman "/lowongan/:id" — detail lowongan publik (PR-059, FR-4.4).
//
// PUBLIK, TANPA `<Terlindungi>` — `GET /jobs/:id` publik di server (PR-055),
// dan tautan ke sini sudah beredar sejak PR-054/058.
//
// TAUTAN "KEMBALI KE DAFTAR" MEMAKAI RIWAYAT bila pengguna datang dari
// daftar pencarian (`state.dariDaftar`, dibawa `KartuLowongan`): navigasi
// mundur memulihkan pencarian, posisi gulir, dan fokus (AC "kembali ke list →
// posisi scroll & fokus pulih"). Datang dari tempat lain (profil perusahaan,
// tautan dibagikan, tab baru) — ia tautan biasa ke "/lowongan", sebab entri
// riwayat sebelumnya bukan daftar lowongan dan `navigate(-1)` akan membawa
// pengguna keluar entah ke mana.
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useKlienApi } from "../app/klien-api.js";
import { DetailLowongan } from "../features/job-feed/detail-lowongan.js";
import type { StateDariDaftar } from "../features/job-feed/kartu-lowongan.js";
import { useTeks } from "../shared/i18n/index.js";

export function LowonganDetail() {
  const t = useTeks();
  const klien = useKlienApi();
  const navigate = useNavigate();
  const lokasi = useLocation();
  const { id } = useParams<{ id: string }>();
  const dariDaftar = (lokasi.state as Partial<StateDariDaftar> | null)?.dariDaftar === true;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <Link
        to="/lowongan"
        onClick={(e) => {
          if (!dariDaftar) return;
          e.preventDefault();
          void navigate(-1);
        }}
        className="self-start text-base font-medium text-gray-900 underline hover:no-underline"
      >
        {t("lowongan.kembaliKeDaftar")}
      </Link>

      {/* `id` hanya `undefined` di luar rute `:id` — tidak pernah lewat `app/routes.ts`. */}
      <DetailLowongan klien={klien} jobId={id ?? ""} />
    </div>
  );
}
