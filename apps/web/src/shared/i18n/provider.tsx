// Provider i18n + hook `useTeks()`.
//
// Mode disimpan sebagai state React, bukan dibaca dari `<html data-lang-mode>`:
// perubahan state merender ulang seluruh pohon, dan itulah yang memenuhi AC
// "toggle mode mengubah seluruh string shell TANPA RELOAD".
//
// PENYAMBUNGAN KE PREFERENSI PENGGUNA BELUM ADA. Atribut `data-lang-mode`
// ditulis store aksesibilitas milik PR-026, yang belum lahir. Karena itu mode
// di sini bisa dikendalikan dari LUAR (prop `mode` + `onModeBerubah`), sehingga
// PR-026 tinggal menyambungkannya tanpa membongkar apa pun di sini.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { katalog, type KunciTeks } from "./katalog/index.js";
import { terjemah } from "./terjemah.js";
import type { ModeBahasa, ParamTeks } from "./tipe.js";

export type FungsiTeks = (kunci: KunciTeks, params?: ParamTeks) => string;

interface NilaiI18n {
  mode: ModeBahasa;
  setMode: (mode: ModeBahasa) => void;
  t: FungsiTeks;
}

const KonteksI18n = createContext<NilaiI18n | null>(null);

export interface PenyediaI18nProps {
  children: ReactNode;
  /** Mode awal. PR-026 akan mengambil alih lewat preferensi pengguna. */
  modeAwal?: ModeBahasa;
  /**
   * Dipanggil saat kunci tidak ditemukan. Bawaannya menulis ke console.
   *
   * Disuntikkan, bukan dipanggil langsung, karena dua alasan: test bisa
   * memastikan pelaporannya terjadi tanpa mengotori keluaran, dan PR-103 bisa
   * mengarahkannya ke backend observability tanpa menyentuh berkas ini.
   */
  laporKunciHilang?: (kunci: string) => void;
}

function laporKeConsole(kunci: string): void {
  /* eslint-disable-next-line no-console -- AC PR-029: kunci hilang wajib
     menghasilkan error log, bukan gagal senyap. Ini pelaporannya. */
  console.error(`[i18n] Kunci teks tidak ditemukan: ${kunci}`);
}

export function PenyediaI18n({
  children,
  modeAwal = "id",
  laporKunciHilang = laporKeConsole,
}: PenyediaI18nProps) {
  const [mode, setMode] = useState<ModeBahasa>(modeAwal);

  const t = useCallback<FungsiTeks>(
    (kunci, params) => {
      const { teks, hilang } = terjemah(katalog, mode, kunci, params);
      if (hilang) laporKunciHilang(kunci);
      return teks;
    },
    [mode, laporKunciHilang],
  );

  // Tanpa useMemo, objek konteks baru pada tiap render akan merender ulang
  // SETIAP komponen yang memakai teks — di aplikasi yang seluruh teksnya lewat
  // sini, itu berarti seluruh layar.
  const nilai = useMemo<NilaiI18n>(() => ({ mode, setMode, t }), [mode, t]);

  return <KonteksI18n.Provider value={nilai}>{children}</KonteksI18n.Provider>;
}

function useKonteks(): NilaiI18n {
  const nilai = useContext(KonteksI18n);
  if (nilai === null) {
    // Gagal keras. Fallback diam-diam ke bahasa bawaan akan membuat komponen
    // yang lupa dibungkus provider tetap "bekerja" — sampai seseorang mengubah
    // mode dan menemukan satu sudut layar yang tidak ikut berubah.
    throw new Error("useTeks dipakai di luar <PenyediaI18n>");
  }
  return nilai;
}

/** Ambil fungsi penerjemah. Kunci diperiksa TIPE — salah ketik = typecheck merah. */
export function useTeks(): FungsiTeks {
  return useKonteks().t;
}

/** Baca & ubah mode bahasa. Dipakai panel preferensi (PR-036). */
export function useModeBahasa(): { mode: ModeBahasa; setMode: (mode: ModeBahasa) => void } {
  const { mode, setMode } = useKonteks();
  return { mode, setMode };
}
