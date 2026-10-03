// Halaman "/kamus/:id" — satu entri kamus BISINDO (PR-086). Publik, SAUDARA
// `/kamus` (halaman penuh, keputusan owner 2026-10-03): bisa dibagikan dan
// di-bookmark. Asal pencarian dibawa lewat `location.state` dari kartu.
import { useLocation, useParams } from "react-router";
import { useKlienApi } from "../app/klien-api.js";
import { DetailKamus } from "../features/kamus/detail-kamus.js";

export function KamusDetail() {
  const klien = useKlienApi();
  const { id = "" } = useParams<{ id: string }>();
  const lokasi = useLocation();
  const asalMentah = (lokasi.state as { asal?: unknown } | null)?.asal;
  const asal = typeof asalMentah === "string" && asalMentah.startsWith("?") ? asalMentah : "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <DetailKamus klien={klien} id={id} asal={asal} />
    </div>
  );
}
