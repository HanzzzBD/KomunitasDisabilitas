// Bagian "Cara melamar" di detail lowongan (PR-078) — menggantikan slot CTA
// PR-059 yang sengaja kosong.
//
// LIMA KEADAAN, masing-masing dengan satu hal yang bisa dilakukan:
//   - sesi dipulihkan  → teks memuat (bukan tombol yang lalu berubah);
//   - belum masuk      → tautan masuk yang MEMBAWA `?lamar=1`, jadi sesudah
//                        masuk dialog langsung terbuka di lowongan yang sama;
//   - sudah pernah melamar (PR-079) → status lamaran + tautan ke detailnya,
//                        tanpa tombol "Lamar" yang pasti ditolak server;
//   - sudah masuk      → tombol "Lamar" pembuka dialog;
//   - sesudah melamar  → ringkasan hasil, tombol hilang.
//
// "SUDAH MELAMAR?" DIBACA LEWAT `GET /me/applications?job_id=` (keputusan
// owner 2026-10-02). Bila pemeriksaan GAGAL (misalnya jaringan),
// tombol tetap ditawarkan: unique (user, job) di server tetap wasitnya, dan
// pemeriksaan yang gagal tidak boleh mengunci orang dari melamar.
//
// `?lamar=1` adalah satu-satunya cara halaman lain meminta dialog ini terbuka
// (halaman masuk, editor CV, chat CV). Parameternya DIHAPUS begitu dipakai
// (`replace`): tanpa itu, memuat ulang halaman atau kembali lewat riwayat akan
// membuka dialog lagi tanpa diminta — perubahan konteks yang tidak diinisiasi
// pengguna (WCAG 3.2.5, dan sangat mengganggu persona Dimas).
//
// FOKUS SESUDAH MELAMAR. Dialog menutup dan tombol pemicunya hilang, jadi
// fokus dipindah ke judul hasil — kalau tidak, fokus jatuh ke <body> dan
// pengguna screen reader kehilangan jejak tepat sesudah keputusan terpenting.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router";
import { applicationsKeys, listMyApplications, type ApiClient } from "@nawasena/api-client";
import type { MyApplication } from "@nawasena/schemas";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { track } from "../../shared/analitik.js";
import { tautanMasuk } from "../../shared/rute/tujuan.js";
import { idPenggunaSaatIni } from "../onboarding/identitas.js";
import { DialogLamar, type HasilLamar } from "./dialog-lamar.js";
import { StatusLamaranBadge } from "./status-lamaran.js";

export const PARAM_LAMAR = "lamar";

export interface BagianLamarProps {
  klien: ApiClient;
  jobId: string;
  judulLowongan: string;
}

export function BagianLamar({ klien, jobId, judulLowongan }: BagianLamarProps) {
  const t = useTeks();
  const status = useStoreSesi((s) => s.status);
  const lokasi = useLocation();
  const [cari, setCari] = useSearchParams();
  const diminta = cari.get(PARAM_LAMAR) === "1";

  const sub = idPenggunaSaatIni();
  const queryClient = useQueryClient();
  const sudah = useQuery({
    queryKey: applicationsKeys.myList(sub, { jobId }),
    queryFn: () => listMyApplications(klien, { jobId, limit: 1 }),
    enabled: status === "masuk",
    // Galat pemeriksaan jatuh ke tombol "Lamar" — lihat kepala berkas.
    retry: false,
  });
  const lamaranAda: MyApplication | undefined = sudah.data?.data[0];

  const [terbuka, setTerbuka] = useState(false);
  const [hasil, setHasil] = useState<HasilLamar | null>(null);
  const judulHasil = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!diminta || status !== "masuk") return;
    setTerbuka(true);
    setCari(
      (sebelum) => {
        const baru = new URLSearchParams(sebelum);
        baru.delete(PARAM_LAMAR);
        return baru;
      },
      { replace: true },
    );
  }, [diminta, status, setCari]);

  if (hasil !== null) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border-2 border-gray-900 p-4">
        <h3
          ref={judulHasil}
          tabIndex={-1}
          className="text-xl font-semibold text-gray-900 focus:outline-none"
        >
          {hasil.jenis === "terkirim"
            ? t("lowongan.lamar.hasil.terkirimJudul")
            : t("lowongan.lamar.hasil.sudahAdaJudul")}
        </h3>
        <p className="text-base text-gray-900">
          {hasil.jenis === "terkirim"
            ? t("lowongan.lamar.hasil.terkirimIsi", { judul: judulLowongan })
            : t("lowongan.lamar.hasil.sudahAdaIsi")}
        </p>
        {hasil.jenis === "terkirim" && (
          <p className="text-base text-gray-900">
            {hasil.lamaran.discloseDisability
              ? t("lowongan.lamar.hasil.diungkap")
              : t("lowongan.lamar.hasil.tidakDiungkap")}
          </p>
        )}
        <Link
          to={
            hasil.jenis === "terkirim"
              ? `/lamaran/${hasil.lamaran.id}`
              : lamaranAda !== undefined
                ? `/lamaran/${lamaranAda.id}`
                : "/lamaran"
          }
          className="text-base font-medium text-gray-900 underline hover:no-underline"
        >
          {t("lowongan.lamar.hasil.keLamaran")}
        </Link>
      </div>
    );
  }

  if (status === "memulihkan") {
    return (
      <WilayahMemuat memuat label={t("lowongan.lamar.memeriksaSesi")}>
        {null}
      </WilayahMemuat>
    );
  }

  if (status === "keluar") {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-base text-gray-900">{t("lowongan.lamar.perluMasuk")}</p>
        <Link
          to={tautanMasuk({ pathname: lokasi.pathname, search: `?${PARAM_LAMAR}=1` })}
          className="inline-flex min-h-sentuh items-center justify-center rounded bg-gray-900 px-4 text-base font-semibold text-white"
        >
          {t("lowongan.lamar.masukUntukMelamar")}
        </Link>
      </div>
    );
  }

  if (sudah.isPending) {
    return (
      <WilayahMemuat memuat label={t("pelamar.sudah.memeriksa")}>
        {null}
      </WilayahMemuat>
    );
  }

  if (lamaranAda !== undefined) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border-2 border-gray-900 p-4">
        <h3 className="text-xl font-semibold text-gray-900">{t("pelamar.sudah.judul")}</h3>
        <p className="flex flex-wrap items-center gap-2 text-base text-gray-900">
          <span>{t("pelamar.statusLabel")}:</span>
          <StatusLamaranBadge status={lamaranAda.status} />
        </p>
        <Link
          to={`/lamaran/${lamaranAda.id}`}
          className="text-base font-medium text-gray-900 underline hover:no-underline"
        >
          {t("pelamar.sudah.lihat")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-base text-gray-900">{t("lowongan.lamar.ajakan")}</p>
      <DialogLamar
        klien={klien}
        jobId={jobId}
        judulLowongan={judulLowongan}
        terbuka={terbuka}
        onUbahTerbuka={setTerbuka}
        onSelesai={(h) => {
          // PR-082 — funnel "lamar": hanya lamaran yang BARU terkirim.
          if (h.jenis === "terkirim") track("lamar");
          setTerbuka(false);
          setHasil(h);
          // "Lamaran Saya" & kotak "sudah melamar" basi — termasuk `sudahAda`,
          // yang lewat ini menemukan id lamarannya untuk tautan hasil.
          void queryClient.invalidateQueries({ queryKey: ["my-applications"] });
        }}
        fokusSaatTutup={() => {
          // Dipanggil Radix TEPAT saat ia hendak mengembalikan fokus ke pemicu —
          // yang kini sudah berganti ringkasan hasil. Tanpa ini Radix menimpa
          // fokus judul hasil (terbukti di e2e saat masih memakai
          // `requestAnimationFrame`). Batal biasa (belum ada hasil) → bawaan.
          const judul = judulHasil.current;
          if (judul === null) return false;
          judul.focus();
          return true;
        }}
        pemicu={<Tombol>{t("lowongan.lamar.tombol")}</Tombol>}
      />
    </div>
  );
}
