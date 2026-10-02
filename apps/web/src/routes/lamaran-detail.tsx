// Halaman "/lamaran/:id" — detail satu lamaran (PR-079). Tujuan tautan
// notifikasi pelamar (`features/notifikasi/tautan.ts`).
import { Link, useParams } from "react-router";
import { useKlienApi } from "../app/klien-api.js";
import { DetailLamaran } from "../features/applications/detail-lamaran.js";
import { useTeks } from "../shared/i18n/index.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";

export function LamaranDetail() {
  return (
    <Terlindungi>
      <IsiLamaranDetail />
    </Terlindungi>
  );
}

function IsiLamaranDetail() {
  const t = useTeks();
  const klien = useKlienApi();
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <Link
        to="/lamaran"
        className="self-start text-base font-medium text-gray-900 underline hover:no-underline"
      >
        {t("pelamar.detail.kembali")}
      </Link>
      <DetailLamaran klien={klien} id={id ?? ""} />
    </div>
  );
}
