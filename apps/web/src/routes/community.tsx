import { useLocation, useSearchParams } from "react-router";
import { useState } from "react";
import { useKlienApi } from "../app/klien-api.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";
import { DaftarRuang } from "../features/community/daftar-ruang.js";
import { dariParam, keParam, type FilterCommunity } from "../features/community/filter-url.js";

const KUNCI_KEMBALI = "nawasena:community-kembali";
function bacaFokus(key: string): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KUNCI_KEMBALI) ?? "null") as {
      key?: unknown;
      id?: unknown;
    } | null;
    return value?.key === key && typeof value.id === "string" ? value.id : null;
  } catch {
    return null;
  }
}

export function CommunityBrowse() {
  const klien = useKlienApi();
  const t = useTeks();
  const location = useLocation();
  const [param, setParam] = useSearchParams();
  const [fokusId, setFokusId] = useState(() => bacaFokus(location.key));
  useJudulHalaman(t("shell.judulDokumen", { halaman: t("community.judul") }));
  const terapkan = (filter: FilterCommunity) => {
    setFokusId(null);
    setParam(keParam(filter), { replace: true, preventScrollReset: true });
  };
  return (
    <div className="page-frame page-frame-wide flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">{t("community.judul")}</h1>
        <p className="text-base">{t("community.penjelasan")}</p>
      </div>
      <DaftarRuang
        klien={klien}
        filter={dariParam(param)}
        onTerapkan={terapkan}
        asal={location.search}
        fokusId={fokusId}
        onBuka={(id) => {
          try {
            sessionStorage.setItem(KUNCI_KEMBALI, JSON.stringify({ key: location.key, id }));
          } catch {
            /* Navigation still works when storage is blocked. */
          }
        }}
      />
    </div>
  );
}
