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
//
// PR-059 — FILTER DI URL, FOKUS DI SESSIONSTORAGE:
// - Filter yang diterapkan ditulis ke query string (`replace`, tanpa reset
//   gulir) — tombol Kembali dari detail mengembalikan pencarian yang sama.
// - Lowongan yang dibuka dicatat bersama `location.key` entri riwayat ini.
//   Kembali ke entri yang SAMA (key-nya tidak berubah pada navigasi mundur)
//   berarti fokus dikembalikan ke kartunya; entri lain mengabaikannya.
import { useCallback, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { useKlienApi } from "../app/klien-api.js";
import { DaftarBrowseLowongan } from "../features/job-feed/browse-daftar.js";
import type { NilaiFilterLowongan } from "../features/job-feed/filter-panel.js";
import { dariParamPencarian, keParamPencarian } from "../features/job-feed/filter-url.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

const KUNCI_KEMBALI = "nawasena:lowongan-kembali";

/**
 * `sessionStorage` bisa MELEMPAR (penyimpanan dimatikan, mode privat
 * sebagian peramban) — kegagalannya hanya berarti fokus tidak dipulihkan,
 * tidak boleh menjatuhkan halaman pencarian.
 */
function bacaFokus(kunciLokasi: string): string | null {
  try {
    const mentah = sessionStorage.getItem(KUNCI_KEMBALI);
    if (mentah === null) return null;
    const isi = JSON.parse(mentah) as { kunci?: unknown; id?: unknown };
    return isi.kunci === kunciLokasi && typeof isi.id === "string" ? isi.id : null;
  } catch {
    return null;
  }
}

export function LowonganBrowse() {
  const t = useTeks();
  const klien = useKlienApi();
  const lokasi = useLocation();
  const [param, setParam] = useSearchParams();
  const [fokusId, setFokusId] = useState(() => bacaFokus(lokasi.key));

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("lowongan.judul") }));

  const terapkan = (nilai: NilaiFilterLowongan) => {
    // Pencarian baru membatalkan pemulihan fokus yang belum sempat terjadi —
    // kartu yang dicari mungkin kebetulan muncul di hasil lain, dan melompat
    // ke sana tanpa diminta adalah perubahan konteks yang tidak diharapkan.
    setFokusId(null);
    setParam(keParamPencarian(nilai), { replace: true, preventScrollReset: true });
  };

  const catatBuka = (id: string) => {
    try {
      sessionStorage.setItem(KUNCI_KEMBALI, JSON.stringify({ kunci: lokasi.key, id }));
    } catch {
      // Tanpa penyimpanan sesi, navigasi tetap berjalan — hanya fokusnya yang tidak dipulihkan.
    }
  };

  const fokusDipulihkan = useCallback(() => {
    try {
      sessionStorage.removeItem(KUNCI_KEMBALI);
    } catch {
      // Lihat `bacaFokus`.
    }
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">{t("lowongan.judul")}</h1>
        <p className="text-base text-gray-900">{t("lowongan.penjelasan")}</p>
      </div>

      <DaftarBrowseLowongan
        klien={klien}
        filter={dariParamPencarian(param)}
        onTerapkan={terapkan}
        fokusLowonganId={fokusId}
        onBukaLowongan={catatBuka}
        onFokusDipulihkan={fokusDipulihkan}
      />
    </div>
  );
}
