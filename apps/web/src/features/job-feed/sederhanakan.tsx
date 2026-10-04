// "Sederhanakan" satu bagian teks lowongan (PR-087, Gap G1) — melengkapi mode
// `id-simple` statis untuk konten DINAMIS (deskripsi & persyaratan).
//
// SATU TOMBOL, LABELNYA BERGANTI. "Sederhanakan" → "Tampilkan teks asli" ⇄
// "Tampilkan versi sederhana" adalah ELEMEN YANG SAMA, jadi fokus keyboard
// tetap di tempatnya saat konten di bawahnya berganti. Perubahannya diumumkan
// lewat wilayah `role="status"` yang SELALU terpasang — wilayah yang baru
// dipasang bersamaan dengan isinya sering tidak dibacakan pembaca layar.
//
// HASIL DISIMPAN DI STATE KOMPONEN. Kembali ke teks asli lalu ke versi
// sederhana lagi TIDAK meminta ulang: setiap permintaan memotong satu jatah.
//
// DEGRADASI = TOMBOL HILANG + PENJELASAN (keputusan owner 2026-10-04, AC
// PR-087). Teks asli tetap tampil apa adanya; penjelasannya memilih kalimat
// dari `alasan` server — "coba lagi besok" hanya benar untuk kuota.
//
// ANTI-XSS: hasil AI dirender sebagai TEKS lewat JSX (React meng-escape-nya),
// sama seperti teks asli — tidak ada `dangerouslySetInnerHTML`.
import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import { simplifyText, type ApiClient } from "@nawasena/api-client";
import type { AiSimplifyAlasanDegradasi, AiSimplifyBagianLowongan } from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { tautanMasuk } from "../../shared/rute/tujuan.js";

const KUNCI_DEGRADASI: Readonly<Record<AiSimplifyAlasanDegradasi, KunciTeks>> = {
  kuota_habis: "lowongan.sederhana.degradasi.kuota_habis",
  ai_tidak_tersedia: "lowongan.sederhana.degradasi.ai_tidak_tersedia",
  dimatikan: "lowongan.sederhana.degradasi.dimatikan",
};

const KELAS_TEKS = "whitespace-pre-line break-words text-base text-gray-900";

export interface TeksSederhanakanProps {
  klien: ApiClient;
  jobId: string;
  bagian: AiSimplifyBagianLowongan;
  /** Judul bagian (mis. "Deskripsi pekerjaan") — dipakai di pengumuman. */
  namaBagian: string;
  teksAsli: string;
}

export function TeksSederhanakan({
  klien,
  jobId,
  bagian,
  namaBagian,
  teksAsli,
}: TeksSederhanakanProps) {
  const t = useTeks();
  const lokasi = useLocation();
  const status = useStoreSesi((s) => s.status);
  const idBantuan = useId();

  const [sederhana, setSederhana] = useState<string | null>(null);
  const [tampilSederhana, setTampilSederhana] = useState(false);
  const [degradasi, setDegradasi] = useState<AiSimplifyAlasanDegradasi | null>(null);
  const [pengumuman, setPengumuman] = useState("");
  const penjelasan = useRef<HTMLParagraphElement>(null);

  // Tombol pemicu HILANG saat degradasi, jadi fokusnya dipindah ke kalimat
  // penjelasan — kalau tidak, fokus jatuh ke <body>. `degradasi` hanya pernah
  // terisi lewat klik, jadi efek ini tidak mencuri fokus saat halaman dimuat.
  useEffect(() => {
    if (degradasi !== null) penjelasan.current?.focus();
  }, [degradasi]);

  const minta = useMutation({
    mutationFn: () => simplifyText(klien, { sumber: "lowongan", id: jobId, bagian }),
    onSuccess: (hasil) => {
      if (hasil.teks === null) {
        // TIDAK diumumkan lewat `role="status"`: fokus pindah ke kalimat
        // penjelasan (efek di atas), dan pembaca layar membacanya di sana —
        // mengumumkannya juga akan membuatnya terdengar dua kali.
        setDegradasi(hasil.alasan);
        return;
      }
      setSederhana(hasil.teks);
      setTampilSederhana(true);
      setPengumuman(t("lowongan.sederhana.diumumkanSederhana", { bagian: namaBagian }));
    },
  });

  function alihkan() {
    const berikut = !tampilSederhana;
    setTampilSederhana(berikut);
    setPengumuman(
      t(berikut ? "lowongan.sederhana.diumumkanSederhana" : "lowongan.sederhana.diumumkanAsli", {
        bagian: namaBagian,
      }),
    );
  }

  const tampil = tampilSederhana && sederhana !== null;

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {pengumuman}
      </p>

      {degradasi !== null ? (
        <p ref={penjelasan} tabIndex={-1} className="text-base text-gray-900">
          {t(KUNCI_DEGRADASI[degradasi])}
        </p>
      ) : status === "keluar" ? (
        <Link
          to={tautanMasuk({ pathname: lokasi.pathname, search: lokasi.search })}
          className="self-start text-base font-medium text-gray-900 underline hover:no-underline"
        >
          {t("lowongan.sederhana.perluMasuk")}
        </Link>
      ) : status === "masuk" ? (
        <div className="flex flex-col items-start gap-1">
          {sederhana === null ? (
            <Tombol
              varian="sekunder"
              aria-describedby={idBantuan}
              aria-disabled={minta.isPending}
              onClick={() => {
                if (!minta.isPending) minta.mutate();
              }}
            >
              {minta.isPending ? t("lowongan.sederhana.memproses") : t("lowongan.sederhana.tombol")}
            </Tombol>
          ) : (
            <Tombol varian="sekunder" onClick={alihkan}>
              {tampil ? t("lowongan.sederhana.lihatAsli") : t("lowongan.sederhana.lihatSederhana")}
            </Tombol>
          )}
          {sederhana === null && (
            <p id={idBantuan} className="text-sm text-gray-700">
              {t("lowongan.sederhana.bantuan")}
            </p>
          )}
          {minta.isError && (
            <p role="alert" className="text-base text-red-700">
              {t("lowongan.sederhana.gagal")}
            </p>
          )}
        </div>
      ) : null}

      {tampil ? (
        <div className="flex flex-col gap-2 border-l-4 border-gray-900 pl-3">
          <p className="text-sm font-semibold text-gray-900">{t("lowongan.sederhana.label")}</p>
          <p className={KELAS_TEKS}>{sederhana}</p>
        </div>
      ) : (
        <p className={KELAS_TEKS}>{teksAsli}</p>
      )}
    </div>
  );
}
