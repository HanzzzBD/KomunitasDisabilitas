// Beranda pengguna yang sudah masuk — feed AI Job Matching (PR-074, US-07).
//
// Dirender oleh `routes/beranda.tsx` di alamat "/" (keputusan owner
// 2026-09-30): pengunjung melihat landing, pengguna yang masuk melihat ini.
//
// PEMULIHAN FOKUS DARI DETAIL — pola SAMA PERSIS dengan `lowongan-browse.tsx`
// (PR-059): lowongan yang dibuka dicatat bersama `location.key` entri riwayat
// ini; kembali ke entri yang sama mengembalikan fokus ke kartunya. Posisi
// gulir dipulihkan `<ScrollRestoration />` di `TataLetak`. Kuncinya berbeda
// dari halaman cari supaya dua daftar tidak saling mengambil catatan.
//
// "CARI LOWONGAN LAIN" membawa provinsi profil ke filter halaman cari. Profil
// belum punya preferensi mode kerja (hanya `openToRemote`, yang sengaja TIDAK
// menyaring — lihat PR-070), jadi mode kerja tidak diisikan.
import { useCallback, useState } from "react";
import { useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getProfile, profilesKeys } from "@nawasena/api-client";
import { useKlienApi } from "../app/klien-api.js";
import { FeedMatching } from "../features/job-feed/feed-matching.js";
import { FILTER_KOSONG } from "../features/job-feed/filter-panel.js";
import { keParamPencarian } from "../features/job-feed/filter-url.js";
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

const KUNCI_KEMBALI = "nawasena:beranda-kembali";

/** `sessionStorage` bisa melempar — alasan sama `lowongan-browse.tsx`. */
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

export function BerandaSeeker() {
  const t = useTeks();
  const klien = useKlienApi();
  const lokasi = useLocation();
  const [fokusId] = useState(() => bacaFokus(lokasi.key));

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("beranda.feed.judul") }));

  // Profil hanya untuk tautan "Cari lowongan lain"; gagal/memuat = tautan polos.
  const profil = useQuery({
    queryKey: profilesKeys.me(idPenggunaSaatIni()),
    queryFn: () => getProfile(klien),
  });
  const param = keParamPencarian({ ...FILTER_KOSONG, province: profil.data?.province ?? "" });
  const tautanCariLain = param.size === 0 ? "/lowongan" : `/lowongan?${param.toString()}`;

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
        <h1 className="text-3xl font-bold text-gray-900">{t("beranda.feed.judul")}</h1>
        <p className="text-base text-gray-900">{t("beranda.feed.penjelasan")}</p>
      </div>

      <FeedMatching
        klien={klien}
        tautanCariLain={tautanCariLain}
        fokusLowonganId={fokusId}
        onBukaLowongan={catatBuka}
        onFokusDipulihkan={fokusDipulihkan}
      />
    </div>
  );
}
