// Halaman "/lowongan" — cari lowongan publik (PR-058, US-08).
//
// PUBLIK DENGAN SENGAJA, TANPA `<Terlindungi>` — sama alasannya dengan
// `/companies/:id`: kandidat mencari lowongan sering sebelum masuk sama
// sekali, dan `GET /jobs` sendiri publik di server (PR-056).
//
// STRUKTUR HEADING: h1 "Cari Lowongan" → (filter, tanpa heading sendiri —
// `<form aria-label>` sudah menamainya) → h2 tersembunyi "Hasil" (murni untuk
// `aria-labelledby`, lihat komentar `DaftarBrowseLowongan`) → h3 per kartu
// lowongan. Tidak ada tingkat yang dilompati.
import { useKlienApi } from "../app/klien-api.js";
import { DaftarBrowseLowongan } from "../features/job-feed/browse-daftar.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

export function LowonganBrowse() {
  const t = useTeks();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("lowongan.judul") }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">{t("lowongan.judul")}</h1>
        <p className="text-base text-gray-900">{t("lowongan.penjelasan")}</p>
      </div>

      <DaftarBrowseLowongan klien={klien} />
    </div>
  );
}
