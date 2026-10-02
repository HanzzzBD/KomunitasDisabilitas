// Halaman "/admin/lamaran/:id" — detail lamaran (PR-077b).
//
// Berbeda dari `/admin/jobs/:id` (yang mencari baris di daftar ter-cache),
// lamaran punya endpoint detail sendiri: kontak + CV + riwayat tidak ikut di
// daftar, jadi tautan langsung (mis. dari notifikasi admin) tetap terbuka utuh.
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { applicationsKeys, getApplicationAdmin } from "@nawasena/api-client";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useKlienApi } from "../app/klien-api.js";
import { DetailLamaran } from "../features/admin/lamaran-detail.js";
import { pesanGalatLamaran } from "../features/admin/lamaran-pesan-galat.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

export function AdminLamaranDetail() {
  const t = useTeks();
  const klien = useKlienApi();
  const { id = "" } = useParams<{ id: string }>();

  const detail = useQuery({
    queryKey: applicationsKeys.adminDetail(id),
    queryFn: () => getApplicationAdmin(klien, id),
  });

  const nama = detail.data?.applicant.fullName ?? t("admin.lamaran.akunDihapus");
  useJudulHalaman(
    t("shell.judulDokumen", {
      halaman:
        detail.data === undefined
          ? t("admin.lamaran.judul")
          : t("admin.lamaran.detail.judul", { nama }),
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/admin/lamaran"
        className="self-start text-base font-medium text-gray-900 underline hover:no-underline"
      >
        {t("admin.lamaran.detail.kembali")}
      </Link>

      {detail.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{pesanGalatLamaran(detail.error, t)}</p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void detail.refetch();
            }}
          >
            {t("admin.lamaran.cobaLagi")}
          </Tombol>
        </div>
      ) : (
        <WilayahMemuat memuat={detail.isPending} label={t("admin.lamaran.detail.memuat")}>
          {detail.data !== undefined && <DetailLamaran klien={klien} lamaran={detail.data} />}
        </WilayahMemuat>
      )}
    </div>
  );
}
