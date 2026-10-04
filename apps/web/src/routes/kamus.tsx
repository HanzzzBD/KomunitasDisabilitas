// Halaman "/kamus" — kamus BISINDO publik (PR-086, ADR-010 v1).
//
// PUBLIK DENGAN SENGAJA, tanpa `<Terlindungi>`: kamus bernilai bagi pengguna
// Tuli sejak sebelum mendaftar, dan `GET /sign-videos` publik di server.
//
// Filter di URL (`replace`), fokus kartu yang dibuka di sessionStorage — pola
// sama `/lowongan` (PR-059): tombol Kembali dari detail mengembalikan
// pencarian yang sama DAN fokus ke kartu yang tadi dibuka.
import { useCallback, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { useKlienApi } from "../app/klien-api.js";
import { DaftarKamus } from "../features/kamus/daftar-kamus.js";
import { dariParam, keParam } from "../features/kamus/filter-url.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

const KUNCI_KEMBALI = "nawasena:kamus-kembali";

/** sessionStorage bisa melempar (mode privat) — gagal = fokus tidak dipulihkan, bukan halaman jatuh. */
function bacaFokus(kunciLokasi: string): string | null {
  try {
    const isi = JSON.parse(sessionStorage.getItem(KUNCI_KEMBALI) ?? "null") as {
      kunci?: unknown;
      id?: unknown;
    } | null;
    return isi?.kunci === kunciLokasi && typeof isi.id === "string" ? isi.id : null;
  } catch {
    return null;
  }
}

export function Kamus() {
  const t = useTeks();
  const klien = useKlienApi();
  const lokasi = useLocation();
  const [param, setParam] = useSearchParams();
  const [fokusId, setFokusId] = useState(() => bacaFokus(lokasi.key));

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("kamus.judul") }));

  const catatBuka = useCallback(
    (id: string) => {
      try {
        sessionStorage.setItem(KUNCI_KEMBALI, JSON.stringify({ kunci: lokasi.key, id }));
      } catch {
        // Tanpa penyimpanan sesi navigasi tetap jalan — hanya fokusnya yang tidak pulih.
      }
    },
    [lokasi.key],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">{t("kamus.judul")}</h1>
        <p className="max-w-prose text-base text-gray-900">{t("kamus.penjelasan")}</p>
      </div>
      <DaftarKamus
        klien={klien}
        filter={dariParam(param)}
        onTerapkan={(filter) => {
          setFokusId(null);
          setParam(keParam(filter), { replace: true, preventScrollReset: true });
        }}
        asalPencarian={lokasi.search}
        fokusId={fokusId}
        onBuka={catatBuka}
      />
    </div>
  );
}
