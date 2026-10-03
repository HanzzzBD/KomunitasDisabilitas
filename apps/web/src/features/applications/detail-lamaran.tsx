// "Lamaran Saya" — detail satu lamaran (PR-079).
//
// KEPUTUSAN OWNER 2026-10-02 yang dijaga berkas ini:
//   1. "Saya diterima" SATU KETUK, tanpa dialog (AC "confirm-hired satu tap").
//      Tombolnya hanya muncul saat status Penawaran kerja / Diterima dan belum
//      dikonfirmasi; server idempoten untuk tekan kedua.
//   2. PERAYAAN = TEKS SAJA, tanpa animasi. Fokus pindah ke judulnya, emoji
//      `aria-hidden` — tidak ada yang bergerak, di mode apa pun (persona Dimas;
//      AC "perayaan aksesibel, bukan animasi-saja").
//   3. TARIK LAMARAN lewat dialog konfirmasi yang menjelaskan akibatnya.
//
// AC "Status terbaru diumumkan saat halaman dibuka": wilayah `role="status"`
// dirender KOSONG sejak awal, lalu diisi begitu data tiba. Live region yang
// lahir bersama isinya sering tidak diumumkan — yang diumumkan adalah
// PERUBAHAN isi wilayah yang sudah ada. Perubahan status sesudah aksi (tarik,
// konfirmasi) ikut diumumkan lewat wilayah yang sama.
//
// RIWAYAT = `<ol>` kronologis (AC "ordered list semantik"), dari
// `petakanLiniMasa` — titik awal "Lamaran dikirim" disisipkan di sana.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  ApiError,
  applicationsKeys,
  confirmHiredMyApplication,
  getMyApplication,
  withdrawMyApplication,
  type ApiClient,
} from "@nawasena/api-client";
import { statusLamaranAktif, type MyApplicationDetail } from "@nawasena/schemas";
import { Dialog, Tombol, TutupDialog, WilayahMemuat } from "@nawasena/ui";
import { useJudulHalaman } from "../../shared/judul-halaman.js";
import { useTeks } from "../../shared/i18n/index.js";
import { idPenggunaSaatIni } from "../onboarding/identitas.js";
import { sekaliSaja, track } from "../../shared/analitik.js";
import { TANGGAL_LAMARAN } from "./daftar-lamaran.js";
import { petakanLiniMasa } from "./lini-masa.js";
import { pesanGalatLamaranSaya } from "./pesan-galat-lamaran-saya.js";
import { KUNCI_ARTI_STATUS, KUNCI_STATUS_PELAMAR, StatusLamaranBadge } from "./status-lamaran.js";

const WAKTU = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const KELAS_H2 = "text-2xl font-semibold text-gray-900";

const STATUS_SAMPAI_WAWANCARA: ReadonlySet<string> = new Set(["interview", "offered", "hired"]);

function tidakDitemukan(galat: unknown): boolean {
  return galat instanceof ApiError && galat.code === "LAMARAN_TIDAK_DITEMUKAN";
}

export function DetailLamaran({ klien, id }: { klien: ApiClient; id: string }) {
  const t = useTeks();
  const sub = idPenggunaSaatIni();
  const lamaran = useQuery({
    queryKey: applicationsKeys.myDetail(sub, id),
    queryFn: () => getMyApplication(klien, id),
    retry: (n, galat) => (tidakDitemukan(galat) ? false : n < 2),
  });

  const hilang = tidakDitemukan(lamaran.error);
  const judul = lamaran.data?.job?.title ?? t("pelamar.lowonganHilang");
  useJudulHalaman(
    t("shell.judulDokumen", {
      halaman: hilang
        ? t("pelamar.detail.tidakDitemukan.judul")
        : lamaran.data !== undefined
          ? judul
          : t("pelamar.memuat"),
    }),
  );

  return (
    <>
      {/* Selalu ada sejak render pertama — lihat kepala berkas. */}
      <p role="status" className="sr-only">
        {lamaran.data === undefined
          ? ""
          : t("pelamar.detail.statusTerbaru", {
              judul,
              status: t(KUNCI_STATUS_PELAMAR[lamaran.data.status]),
            })}
      </p>

      {hilang ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">
            {t("pelamar.detail.tidakDitemukan.judul")}
          </h1>
          <p className="text-base text-gray-900">{t("pelamar.detail.tidakDitemukan.penjelasan")}</p>
        </div>
      ) : lamaran.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{t("pelamar.gagalMuat")}</p>
          <p className="text-base text-gray-900">{pesanGalatLamaranSaya(lamaran.error, t)}</p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void lamaran.refetch();
            }}
          >
            {t("pelamar.cobaLagi")}
          </Tombol>
        </div>
      ) : (
        <WilayahMemuat memuat={lamaran.isPending} label={t("pelamar.memuat")}>
          {lamaran.data !== undefined && (
            <IsiDetail klien={klien} lamaran={lamaran.data} judul={judul} />
          )}
        </WilayahMemuat>
      )}
    </>
  );
}

interface IsiDetailProps {
  klien: ApiClient;
  lamaran: MyApplicationDetail;
  judul: string;
}

function IsiDetail({ klien, lamaran, judul }: IsiDetailProps) {
  const t = useTeks();
  const sub = idPenggunaSaatIni();
  const queryClient = useQueryClient();
  const judulStatus = useRef<HTMLHeadingElement>(null);
  const judulSelamat = useRef<HTMLHeadingElement>(null);
  const [tarikTerbuka, setTarikTerbuka] = useState(false);
  // REF, bukan `tarik.isSuccess`: dialog dilepas pada render yang sama dengan
  // keberhasilannya, jadi `fokusSaatTutup` yang dipanggil Radix adalah closure
  // render SEBELUMNYA — saat `isSuccess` masih false.
  const sudahDitarik = useRef(false);
  const [baruDikonfirmasi, setBaruDikonfirmasi] = useState(false);

  function simpan(hasil: MyApplicationDetail): void {
    queryClient.setQueryData(applicationsKeys.myDetail(sub, hasil.id), hasil);
    // Daftar & kotak "sudah melamar" di detail lowongan ikut basi.
    void queryClient.invalidateQueries({ queryKey: ["my-applications"] });
  }

  const tarik = useMutation({
    mutationFn: () => withdrawMyApplication(klien, lamaran.id),
    onSuccess: (hasil) => {
      sudahDitarik.current = true;
      simpan(hasil);
      setTarikTerbuka(false);
    },
  });

  const konfirmasi = useMutation({
    mutationFn: () => confirmHiredMyApplication(klien, lamaran.id),
    onSuccess: (hasil) => {
      simpan(hasil);
      // PR-082 — funnel "hired_confirmed" (North Star).
      track("hired_confirmed");
      setBaruDikonfirmasi(true);
    },
  });

  // Tombol "Saya diterima" lenyap begitu konfirmasi tersimpan; fokus dibawa ke
  // judul perayaan (efek, sesudah judulnya ada di DOM — tidak ada dialog yang
  // ikut berebut fokus di sini).
  //
  // `hiredConfirmedAt` ikut di dependensi: state lokal dan data query bisa
  // ter-commit di render yang BERBEDA — saat `baruDikonfirmasi` lebih dulu,
  // judulnya belum ada dan fokus harus menunggu data berikutnya.
  const terkonfirmasi = lamaran.hiredConfirmedAt;
  useEffect(() => {
    if (baruDikonfirmasi && terkonfirmasi !== null) judulSelamat.current?.focus();
  }, [baruDikonfirmasi, terkonfirmasi]);

  // PR-082 — funnel "wawancara" (keputusan owner 2026-10-03): dikirim dari
  // peramban PELAMAR saat ia melihat lamarannya sudah sampai wawancara atau
  // lebih jauh (admin boleh melompat status). Sekali per lamaran.
  const sampaiWawancara = STATUS_SAMPAI_WAWANCARA.has(lamaran.status);
  useEffect(() => {
    if (!sampaiWawancara) return;
    sekaliSaja(`wawancara.${lamaran.id}`, () => {
      track("wawancara");
    });
  }, [sampaiWawancara, lamaran.id]);

  const bolehTarik = statusLamaranAktif(lamaran.status);
  const bolehKonfirmasi =
    (lamaran.status === "offered" || lamaran.status === "hired") &&
    lamaran.hiredConfirmedAt === null;
  const liniMasa = petakanLiniMasa(lamaran);

  return (
    <article aria-labelledby="lamaran-detail-judul" className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 id="lamaran-detail-judul" className="text-3xl font-bold break-words text-gray-900">
          {judul}
        </h1>
        {lamaran.job !== null && (
          <p className="text-lg break-words text-gray-900">{lamaran.job.companyName}</p>
        )}
        <p className="text-base text-gray-700">
          {t("pelamar.dilamar", {
            tanggal: TANGGAL_LAMARAN.format(new Date(lamaran.appliedAt)),
          })}
        </p>
        {lamaran.job?.aktif === true ? (
          <Link
            to={`/lowongan/${lamaran.jobId}`}
            className="self-start text-base font-medium break-words text-gray-900 underline hover:no-underline"
          >
            {t("pelamar.detail.lihatLowongan", { judul })}
          </Link>
        ) : lamaran.job !== null ? (
          <p className="text-base text-gray-700">{t("pelamar.lowonganDitutup")}</p>
        ) : null}
      </header>

      <section aria-labelledby="lamaran-detail-status" className="flex flex-col gap-3">
        <h2
          id="lamaran-detail-status"
          ref={judulStatus}
          tabIndex={-1}
          className={`${KELAS_H2} focus:outline-none`}
        >
          {t("pelamar.detail.statusSekarang")}
        </h2>
        <StatusLamaranBadge status={lamaran.status} className="self-start" />
        <p className="text-base text-gray-900">{t(KUNCI_ARTI_STATUS[lamaran.status])}</p>
        <p className="text-base text-gray-700">
          {lamaran.discloseDisability
            ? t("pelamar.detail.pengungkapan.ya")
            : t("pelamar.detail.pengungkapan.tidak")}
        </p>

        {bolehTarik && (
          <Dialog
            judul={t("pelamar.tarik.dialogJudul")}
            deskripsi={t("pelamar.tarik.dialogIsi")}
            terbuka={tarikTerbuka}
            onUbahTerbuka={(b) => {
              setTarikTerbuka(b);
              if (!b) tarik.reset();
            }}
            // Bukan "Jangan tarik": dua tombol bernama sama di satu dialog tidak
            // bisa dibedakan di daftar tombol screen reader (temuan e2e PR-079).
            labelTutup={t("pelamar.tarik.tutup")}
            // Sesudah ditarik, tombol pemicu lenyap (status tidak aktif lagi);
            // fokus ke judul status yang kini berbunyi "Ditarik".
            fokusSaatTutup={() => {
              if (!sudahDitarik.current || judulStatus.current === null) return false;
              judulStatus.current.focus();
              return true;
            }}
            pemicu={
              <Tombol varian="sekunder" className="self-start">
                {t("pelamar.tarik.tombol")}
              </Tombol>
            }
            aksi={
              <>
                <TutupDialog asChild>
                  <Tombol varian="sekunder">{t("pelamar.tarik.batal")}</Tombol>
                </TutupDialog>
                <Tombol
                  varian="bahaya"
                  aria-disabled={tarik.isPending}
                  aria-busy={tarik.isPending}
                  onClick={() => {
                    if (!tarik.isPending) tarik.mutate();
                  }}
                >
                  {tarik.isPending ? t("pelamar.tarik.menarik") : t("pelamar.tarik.ya")}
                </Tombol>
              </>
            }
          >
            {tarik.isError && (
              <p role="alert" className="text-base font-medium text-red-700">
                {pesanGalatLamaranSaya(tarik.error, t)}
              </p>
            )}
          </Dialog>
        )}
      </section>

      {lamaran.hiredConfirmedAt !== null ? (
        <section
          aria-labelledby="lamaran-detail-selamat"
          className="flex flex-col gap-2 rounded-md border-2 border-green-700 bg-green-50 p-4"
        >
          <h2
            id="lamaran-detail-selamat"
            ref={judulSelamat}
            tabIndex={-1}
            className={`${KELAS_H2} focus:outline-none`}
          >
            {t("pelamar.diterima.selamat")} <span aria-hidden="true">🎉</span>
          </h2>
          <p className="text-base text-gray-900">{t("pelamar.diterima.selamatIsi")}</p>
          <p className="text-base text-gray-700">
            {t("pelamar.diterima.tercatat", {
              tanggal: TANGGAL_LAMARAN.format(new Date(lamaran.hiredConfirmedAt)),
            })}
          </p>
        </section>
      ) : bolehKonfirmasi ? (
        <section aria-labelledby="lamaran-detail-diterima" className="flex flex-col gap-3">
          <h2 id="lamaran-detail-diterima" className={KELAS_H2}>
            {t("pelamar.diterima.judul")}
          </h2>
          <p className="text-base text-gray-900">{t("pelamar.diterima.penjelasan")}</p>
          <Tombol
            className="self-start"
            aria-disabled={konfirmasi.isPending}
            aria-busy={konfirmasi.isPending}
            onClick={() => {
              if (!konfirmasi.isPending) konfirmasi.mutate();
            }}
          >
            {konfirmasi.isPending ? (
              t("pelamar.diterima.menyimpan")
            ) : (
              <>
                {t("pelamar.diterima.tombol")} <span aria-hidden="true">🎉</span>
              </>
            )}
          </Tombol>
          {konfirmasi.isError && (
            <p role="alert" className="text-base font-medium text-red-700">
              {pesanGalatLamaranSaya(konfirmasi.error, t)}
            </p>
          )}
        </section>
      ) : null}

      <section aria-labelledby="lamaran-detail-riwayat" className="flex flex-col gap-3">
        <h2 id="lamaran-detail-riwayat" className={KELAS_H2}>
          {t("pelamar.riwayat.judul")}
        </h2>
        <ol className="m-0 flex list-decimal flex-col gap-3 pl-6">
          {liniMasa.map((e) => (
            <li
              key={`${e.at}-${e.status ?? "awal"}`}
              aria-current={e.terbaru ? "step" : undefined}
              className="text-base text-gray-900"
            >
              <span className="font-semibold">
                {e.status === null
                  ? t("pelamar.riwayat.dikirim")
                  : t(KUNCI_STATUS_PELAMAR[e.status])}
              </span>
              {e.terbaru && (
                <span className="ml-2 rounded-full border border-gray-900 px-2 text-sm font-semibold">
                  {t("pelamar.riwayat.terbaru")}
                </span>
              )}
              <br />
              <time dateTime={e.at} className="text-gray-700">
                {WAKTU.format(new Date(e.at))}
              </time>
              {e.oleh !== null && (
                <span className="text-gray-700">
                  {" — "}
                  {e.oleh === "seeker"
                    ? t("pelamar.riwayat.olehAnda")
                    : t("pelamar.riwayat.olehTim")}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
