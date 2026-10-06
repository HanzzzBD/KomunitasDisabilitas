// Halaman "/lamaran" — Lamaran Saya (PR-079). Terlindungi: jalur pelamar.
import { useKlienApi } from "../app/klien-api.js";
import { DaftarLamaran } from "../features/applications/daftar-lamaran.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";

export function LamaranSaya() {
  return (
    <Terlindungi>
      <IsiLamaranSaya />
    </Terlindungi>
  );
}

function IsiLamaranSaya() {
  const t = useTeks();
  const klien = useKlienApi();
  useJudulHalaman(t("shell.judulDokumen", { halaman: t("pelamar.judul") }));
  return (
    <div className="page-frame page-panel flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">{t("pelamar.judul")}</h1>
        <p className="text-base text-gray-700">{t("pelamar.deskripsi")}</p>
      </div>
      <DaftarLamaran klien={klien} />
    </div>
  );
}
