// Dialog lamar (PR-078, PRD US-11 / FR-5.1 / FR-5.2) — momen paling sensitif
// di produk ini: keputusan mengungkap data disabilitas kepada perusahaan.
//
// KEPUTUSAN OWNER 2026-10-02 yang dijaga berkas ini:
//
//   1. DIALOG MODAL di halaman lowongan (Radix lewat `@nawasena/ui`: fokus
//      terjerat, Escape menutup, fokus kembali ke tombol "Lamar").
//   2. PILIHAN PENGUNGKAPAN MULAI KOSONG. Dua radio SETARA — kelas, ukuran,
//      urutan bacaan, dan panjang penjelasannya sebanding — dan tidak ada yang
//      terpilih. Kirim tanpa memilih = pesan galat, bukan "Tidak" diam-diam.
//      Karena itu tidak ada dark pattern yang mungkin: tidak ada pilihan yang
//      lebih menonjol, lebih mudah, atau sudah dibuatkan.
//   3. PRATINJAU apa yang akan disalin, diambil dari profil pengguna sendiri
//      (`GET /me/profile` — pembacaan pemilik, bukan jalur ber-audit). Bila
//      tidak ada yang bisa diungkap, "Ya" dinonaktifkan beserta alasannya dan
//      tautan ke Profil — bukan disembunyikan, supaya pengguna tahu pilihan
//      itu ada.
//   4. TANPA CV → dua pintu setara (AI / dari profil) yang membawa `?tujuan=`
//      kembali ke lowongan ini dengan `?lamar=1`, sehingga dialog terbuka lagi
//      sendiri sesudah CV jadi.
//
// KLIK GANDA (AC "tidak melamar dua kali") dijaga DUA lapis: tombol Kirim
// menolak klik selama permintaan berjalan (`aria-disabled`, bukan `disabled` —
// tombol yang menjadi `disabled` saat difokus menjatuhkan fokus ke <body>), dan
// setiap klik dalam satu pembukaan dialog membawa Idempotency-Key yang SAMA,
// sehingga server memperlakukannya sebagai satu permintaan.
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  ApiError,
  applyJob,
  getProfile,
  listResumes,
  profilesKeys,
  resumesKeys,
  type ApiClient,
} from "@nawasena/api-client";
import type { Application, SensitiveProfile } from "@nawasena/schemas";
import { Dialog, Tombol, TutupDialog, WilayahMemuat } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { denganTujuan } from "../../shared/rute/tujuan.js";
import { KUNCI_AKOMODASI } from "../companies-publik/akomodasi-daftar.js";
import { RAGAM } from "../onboarding/langkah-ragam-disabilitas.js";
import { idPenggunaSaatIni } from "../onboarding/identitas.js";
import { useBuatCvDariProfil } from "../resume/use-buat-cv.js";
import {
  ISIAN_AWAL,
  cvBawaan,
  dataUntukDiungkap,
  kunciIdempotensiBaru,
  periksaIsian,
  type GalatIsian,
  type IsianLamar,
  type PilihanUngkap,
} from "./keadaan-lamar.js";
import { pesanGalatLamar } from "./pesan-galat.js";

const TANGGAL = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

const KUNCI_RAGAM: Readonly<Record<string, KunciTeks>> = Object.fromEntries(
  RAGAM.map((r) => [r.nilai, r.kunci]),
);

/** Hasil akhir yang dibawa keluar dialog: lamaran baru, atau lamaran yang sudah ada. */
export type HasilLamar = { jenis: "terkirim"; lamaran: Application } | { jenis: "sudahAda" };

export interface DialogLamarProps {
  klien: ApiClient;
  jobId: string;
  judulLowongan: string;
  terbuka: boolean;
  onUbahTerbuka(terbuka: boolean): void;
  onSelesai(hasil: HasilLamar): void;
  /** Tombol pemicu — fokus kembali ke sini saat dialog ditutup. */
  pemicu: ReactNode;
  /** Lihat `DialogProps.fokusSaatTutup` — pemicu hilang sesudah melamar. */
  fokusSaatTutup?: () => boolean;
}

export function DialogLamar(props: DialogLamarProps) {
  const t = useTeks();
  return (
    <Dialog
      judul={t("lowongan.lamar.judul", { judul: props.judulLowongan })}
      deskripsi={t("lowongan.lamar.deskripsi")}
      terbuka={props.terbuka}
      onUbahTerbuka={props.onUbahTerbuka}
      pemicu={props.pemicu}
      labelTutup={t("lowongan.lamar.batal")}
      fokusSaatTutup={props.fokusSaatTutup}
      className="w-[min(40rem,calc(100vw-2rem))]"
    >
      {/* Isi hanya dirender saat terbuka (Radix), jadi kunci idempotensi dan
          isian lahir baru pada SETIAP pembukaan. */}
      <IsiDialog {...props} />
    </Dialog>
  );
}

const KELAS_OPSI =
  "flex min-h-sentuh cursor-pointer items-start gap-3 rounded-md border-2 border-gray-400 p-3 has-[:checked]:border-gray-900 has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-gray-100";
const KELAS_RADIO = "mt-1 h-5 w-5 shrink-0 accent-gray-900";
/** Bingkai sama dengan `KELAS_OPSI`; grid supaya label & konsekuensi jadi dua baris. */
const KELAS_OPSI_UNGKAP =
  "grid min-h-sentuh cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-md border-2 border-gray-400 p-3 has-[:checked]:border-gray-900 has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-gray-100";

function IsiDialog({ klien, jobId, onSelesai }: DialogLamarProps) {
  const t = useTeks();
  const sub = idPenggunaSaatIni();
  const navigate = useNavigate();
  const idForm = useId();
  const idGalatCv = `${idForm}-galat-cv`;
  const idGalatUngkap = `${idForm}-galat-ungkap`;
  const formulir = useRef<HTMLFormElement>(null);

  const [kunci] = useState(kunciIdempotensiBaru);
  const [isian, setIsian] = useState<IsianLamar>(ISIAN_AWAL);
  const [cvDisentuh, setCvDisentuh] = useState(false);
  const [galat, setGalat] = useState<GalatIsian>({});

  const daftarCv = useQuery({
    queryKey: resumesKeys.list(sub),
    queryFn: () => listResumes(klien),
  });
  const profil = useQuery({
    queryKey: profilesKeys.me(sub),
    queryFn: () => getProfile(klien),
  });

  // CV bawaan diturunkan, bukan disalin ke state lewat efek: selama pengguna
  // belum memilih sendiri, yang terpilih selalu CV terbaru dari data terkini.
  const resumeId = cvDisentuh ? isian.resumeId : cvBawaan(daftarCv.data ?? []);
  const data = dataUntukDiungkap(profil.data);
  const bolehUngkap = data !== null;

  const tujuanKembali = `/lowongan/${jobId}?lamar=1`;
  const buatCv = useBuatCvDariProfil({
    klien,
    sub,
    judulBawaan: t("lowongan.lamar.cv.judulBawaan"),
    onBerhasil: (resume) => {
      void navigate(denganTujuan(`/cv/${resume.id}`, tujuanKembali));
    },
  });

  const kirim = useMutation({
    mutationFn: (input: { resumeId: string; discloseDisability: boolean }) =>
      applyJob(klien, jobId, input, kunci),
    onSuccess: (lamaran) => {
      onSelesai({ jenis: "terkirim", lamaran });
    },
    onError: (e) => {
      // Lamaran yang sudah ada BUKAN kegagalan bagi pengguna: tujuannya
      // (melamar lowongan ini) sudah tercapai — mis. permintaan pertama
      // berhasil tetapi jawabannya hilang di jalan.
      if (e instanceof ApiError && e.code === "SUDAH_MELAMAR") onSelesai({ jenis: "sudahAda" });
    },
  });

  function fokusKe(nama: string): void {
    const el = formulir.current?.querySelector<HTMLInputElement>(
      `input[name="${nama}"]:not(:disabled)`,
    );
    el?.focus();
  }

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    if (kirim.isPending) return;
    const hasil = periksaIsian({ ...isian, resumeId }, bolehUngkap);
    if (!hasil.ok) {
      setGalat(hasil.galat);
      fokusKe(hasil.galat.cv !== undefined ? `${idForm}-cv` : `${idForm}-ungkap`);
      return;
    }
    setGalat({});
    kirim.mutate(hasil.input);
  }

  function pilihUngkap(nilai: PilihanUngkap): void {
    setIsian((s) => ({ ...s, ungkap: nilai }));
    setGalat((g) => ({ ...g, ungkap: undefined }));
  }

  const galatKirim =
    kirim.isError && !(kirim.error instanceof ApiError && kirim.error.code === "SUDAH_MELAMAR")
      ? pesanGalatLamar(kirim.error, t)
      : null;

  return (
    <form ref={formulir} noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* ---------------------------------------------------------- CV --- */}
      <WilayahMemuat memuat={daftarCv.isPending} label={t("lowongan.lamar.cv.memuat")}>
        {daftarCv.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-base font-medium text-red-700">
              {pesanGalatLamar(daftarCv.error, t)}
            </p>
            <Tombol
              varian="sekunder"
              onClick={() => {
                void daftarCv.refetch();
              }}
            >
              {t("lowongan.lamar.cobaLagi")}
            </Tombol>
          </div>
        ) : daftarCv.data !== undefined && daftarCv.data.length === 0 ? (
          <section aria-labelledby={`${idForm}-tanpa-cv`} className="flex flex-col gap-3">
            <h3 id={`${idForm}-tanpa-cv`} className="text-lg font-semibold text-gray-900">
              {t("lowongan.lamar.cv.kosongJudul")}
            </h3>
            <p>{t("lowongan.lamar.cv.kosongPenjelasan")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                to={denganTujuan("/cv/chat", tujuanKembali)}
                className="inline-flex min-h-sentuh items-center justify-center rounded border-2 border-gray-900 px-4 text-base font-semibold text-gray-900"
              >
                {t("lowongan.lamar.cv.buatChat")}
              </Link>
              <Tombol
                type="button"
                varian="sekunder"
                aria-disabled={buatCv.isPending}
                aria-busy={buatCv.isPending}
                onClick={() => {
                  if (!buatCv.isPending) buatCv.mutate();
                }}
              >
                {buatCv.isPending
                  ? t("lowongan.lamar.cv.membuat")
                  : t("lowongan.lamar.cv.buatProfil")}
              </Tombol>
            </div>
            {buatCv.isError && (
              <p role="alert" className="text-base font-medium text-red-700">
                {pesanGalatLamar(buatCv.error, t)}
              </p>
            )}
          </section>
        ) : daftarCv.data !== undefined ? (
          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={galat.cv !== undefined ? idGalatCv : undefined}
          >
            <legend className="mb-2 text-lg font-semibold text-gray-900">
              {t("lowongan.lamar.cv.legend")}
            </legend>
            {galat.cv !== undefined && (
              <p id={idGalatCv} role="alert" className="text-base font-medium text-red-700">
                {t(galat.cv)}
              </p>
            )}
            {daftarCv.data.map((cv) => (
              <label key={cv.id} className={KELAS_OPSI}>
                <input
                  type="radio"
                  name={`${idForm}-cv`}
                  value={cv.id}
                  checked={resumeId === cv.id}
                  onChange={() => {
                    setCvDisentuh(true);
                    setIsian((s) => ({ ...s, resumeId: cv.id }));
                    setGalat((g) => ({ ...g, cv: undefined }));
                  }}
                  className={KELAS_RADIO}
                />
                <span className="flex min-w-0 flex-col font-semibold break-words">
                  {cv.title}
                  <span className="font-normal text-gray-700">
                    {t("lowongan.lamar.cv.diperbarui", {
                      tanggal: TANGGAL.format(new Date(cv.updatedAt)),
                    })}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
      </WilayahMemuat>

      {/* ------------------------------------------------- Pengungkapan --- */}
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={galat.ungkap !== undefined ? idGalatUngkap : undefined}
      >
        <legend className="mb-1 text-lg font-semibold text-gray-900">
          {t("lowongan.lamar.ungkap.legend")}
        </legend>
        <p className="text-gray-700">{t("lowongan.lamar.ungkap.bantuan")}</p>
        {galat.ungkap !== undefined && (
          <p id={idGalatUngkap} role="alert" className="text-base font-medium text-red-700">
            {t(galat.ungkap)}
          </p>
        )}
        <OpsiUngkap
          nama={`${idForm}-ungkap`}
          nilai="ya"
          terpilih={isian.ungkap === "ya"}
          nonaktif={!bolehUngkap}
          idAlasanNonaktif={bolehUngkap ? undefined : `${idForm}-alasan-ya`}
          label={t("lowongan.lamar.ungkap.ya")}
          akibat={t("lowongan.lamar.ungkap.yaAkibat")}
          onPilih={pilihUngkap}
        />
        <OpsiUngkap
          nama={`${idForm}-ungkap`}
          nilai="tidak"
          terpilih={isian.ungkap === "tidak"}
          nonaktif={false}
          label={t("lowongan.lamar.ungkap.tidak")}
          akibat={t("lowongan.lamar.ungkap.tidakAkibat")}
          onPilih={pilihUngkap}
        />
        {profil.isPending ? (
          <p className="text-gray-700">{t("lowongan.lamar.ungkap.memuatProfil")}</p>
        ) : !bolehUngkap ? (
          <p id={`${idForm}-alasan-ya`} className="text-gray-900">
            {profil.isError
              ? t("lowongan.lamar.ungkap.profilGagal")
              : t("lowongan.lamar.ungkap.tidakAdaData")}{" "}
            <Link to="/profil" className="font-medium underline hover:no-underline">
              {t("lowongan.lamar.ungkap.keProfil")}
            </Link>
          </p>
        ) : null}
      </fieldset>

      {isian.ungkap === "ya" && data !== null && <Pratinjau data={data} idInduk={idForm} />}

      {galatKirim !== null && (
        <p role="alert" className="text-base font-medium text-red-700">
          {galatKirim}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <TutupDialog asChild>
          <Tombol type="button" varian="sekunder">
            {t("lowongan.lamar.batal")}
          </Tombol>
        </TutupDialog>
        <Tombol type="submit" aria-disabled={kirim.isPending} aria-busy={kirim.isPending}>
          {kirim.isPending ? t("lowongan.lamar.mengirim") : t("lowongan.lamar.kirim")}
        </Tombol>
      </div>
    </form>
  );
}

interface OpsiUngkapProps {
  nama: string;
  nilai: PilihanUngkap;
  terpilih: boolean;
  nonaktif: boolean;
  /** Kalimat yang menjelaskan KENAPA pilihan ini nonaktif — ikut dibacakan. */
  idAlasanNonaktif?: string;
  label: string;
  akibat: string;
  onPilih(nilai: PilihanUngkap): void;
}

/**
 * Satu pilihan pengungkapan. KEDUA pilihan dirender oleh komponen ini — itulah
 * jaminan "setara secara visual": tidak ada jalan untuk memberi salah satunya
 * kelas, warna, atau ukuran yang berbeda tanpa mengubah keduanya.
 */
function OpsiUngkap({
  nama,
  nilai,
  terpilih,
  nonaktif,
  idAlasanNonaktif,
  label,
  akibat,
  onPilih,
}: OpsiUngkapProps) {
  const idLabel = useId();
  const idAkibat = useId();
  // NAMA = label saja; konsekuensi = DESKRIPSI. Keduanya di dalam <label> (seluruh
  // kartu bisa diklik), jadi tanpa `aria-labelledby` konsekuensinya ikut masuk
  // nama DAN deskripsi — NVDA membacakannya dua kali (run verifikasi 2026-10-02).
  return (
    <label className={KELAS_OPSI_UNGKAP}>
      <input
        type="radio"
        name={nama}
        value={nilai}
        checked={terpilih}
        disabled={nonaktif}
        aria-labelledby={idLabel}
        aria-describedby={
          idAlasanNonaktif === undefined ? idAkibat : `${idAkibat} ${idAlasanNonaktif}`
        }
        onChange={() => {
          onPilih(nilai);
        }}
        className={`${KELAS_RADIO} row-span-2`}
      />
      <span id={idLabel} className="font-semibold">
        {label}
      </span>
      <span id={idAkibat} className="text-gray-700">
        {akibat}
      </span>
    </label>
  );
}

/** Persis yang akan disalin ke lamaran bila "Ya" — aturan sama `buatSnapshot` server. */
function Pratinjau({ data, idInduk }: { data: SensitiveProfile; idInduk: string }) {
  const t = useTeks();
  const idJudul = `${idInduk}-pratinjau`;
  const catatan = data.accommodationNeeds.notes;
  return (
    <section
      aria-labelledby={idJudul}
      className="flex flex-col gap-2 rounded-md border border-gray-400 bg-gray-50 p-3"
    >
      <h3 id={idJudul} className="text-base font-semibold text-gray-900">
        {t("lowongan.lamar.pratinjau.judul")}
      </h3>
      <dl className="m-0 flex flex-col gap-2">
        <div>
          <dt className="font-semibold">{t("lowongan.lamar.pratinjau.ragam")}</dt>
          <dd className="m-0">
            {data.disabilityTypes.length > 0
              ? data.disabilityTypes
                  .map((r) => t(KUNCI_RAGAM[r] ?? "lowongan.lamar.pratinjau.ragam"))
                  .join(", ")
              : t("lowongan.lamar.pratinjau.kosong")}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("lowongan.lamar.pratinjau.akomodasi")}</dt>
          <dd className="m-0">
            {data.accommodationNeeds.tags.length > 0
              ? data.accommodationNeeds.tags.map((a) => t(KUNCI_AKOMODASI[a])).join(", ")
              : t("lowongan.lamar.pratinjau.kosong")}
          </dd>
        </div>
        {catatan !== null && (
          <div>
            <dt className="font-semibold">{t("lowongan.lamar.pratinjau.catatan")}</dt>
            <dd className="m-0 break-words whitespace-pre-line">{catatan}</dd>
          </div>
        )}
      </dl>
      <p className="text-gray-700">{t("lowongan.lamar.pratinjau.salinan")}</p>
    </section>
  );
}
