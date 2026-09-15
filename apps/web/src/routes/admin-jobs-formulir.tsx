// Halaman "/admin/jobs/baru" DAN "/admin/jobs/:id" — satu komponen untuk
// keduanya (PR-057), pola sama persis `admin-companies-formulir.tsx`: alur
// buat/ubah identik, dan salinan kedua adalah tempat salah satunya lupa
// divalidasi.
//
// TIDAK ADA GET SATU LOWONGAN (server memang tidak menyediakannya, sama
// alasannya dengan companies). Mode UBAH mencari barisnya dari
// `listJobsAdmin` yang sama dengan yang dipakai halaman daftar.
//
// STATUS ADALAH DUA AKSI TERPISAH DARI "Simpan" — Terbitkan dan Tutup,
// masing-masing tombolnya sendiri, TIDAK ADA di formulir (lihat
// `jobs-badan.ts`). "Tutup" WAJIB dialog konfirmasi (Security Considerations
// PR-057: "Konfirmasi close (berdampak pelamar)") — "Terbitkan" TIDAK, sebab
// dokumen phase hanya menyebut dampak pada CLOSE, bukan publish.
//
// VALIDASI AKOMODASI SEBELUM TERBITKAN, DI KLIEN: tombol Terbitkan NONAKTIF
// (bukan sekadar menolak sesudah diklik) selama lowongan TERSIMPAN belum
// punya satu pun akomodasi — AC "Validasi akomodasi wajib sebelum publish
// (server+client)". Diperiksa atas `lowongan.accommodations` (data
// TERSIMPAN), BUKAN `nilai.accommodations` (isian form yang mungkin belum
// disimpan): yang benar-benar diterbitkan adalah yang sudah tersimpan di
// server, jadi itulah yang harus diperiksa — perubahan di form yang belum
// ditekan Simpan tidak boleh membuat tombol Terbitkan tampak siap padahal
// belum.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import {
  closeJobAdmin,
  companiesKeys,
  createJobAdmin,
  jobsKeys,
  listCompaniesAdmin,
  listJobsAdmin,
  publishJobAdmin,
  updateJobAdmin,
  type BuatLowongan,
  type UbahLowongan,
} from "@nawasena/api-client";
import { createJobSchema, updateJobSchema, type JobAdmin } from "@nawasena/schemas";
import { Dialog, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useKlienApi } from "../app/klien-api.js";
// Impor per berkas, bukan barrel `features/admin/index.js` — lihat alasan
// yang sama di `routes/admin-jobs.tsx`.
import {
  keBadanBuat,
  keBadanUbah,
  keNilai,
  NILAI_KOSONG,
  type NilaiLowongan,
} from "../features/admin/jobs-badan.js";
import { FormulirLowongan } from "../features/admin/jobs-formulir.js";
import { JobStatusBadge } from "../features/admin/jobs-status-badge.js";
import { periksa, pesanGalatSimpan, type GalatKolom } from "../features/admin/jobs-pesan-galat.js";

export function AdminJobsFormulir() {
  const t = useTeks();
  const klien = useKlienApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id?: string }>();
  const mode: "buat" | "ubah" = id === undefined ? "buat" : "ubah";

  // Mode UBAH saja yang butuh daftar lowongan — mode BUAT tidak punya apa pun
  // untuk dicari. `enabled: false` mencegah permintaan yang jawabannya tidak
  // dipakai.
  const daftar = useQuery({
    queryKey: jobsKeys.adminList(),
    queryFn: () => listJobsAdmin(klien),
    enabled: mode === "ubah",
  });
  // Perusahaan SELALU dibutuhkan (pemilih di formulir, kedua mode) — beda
  // dari `daftar` lowongan.
  const perusahaan = useQuery({
    queryKey: companiesKeys.adminList(),
    queryFn: () => listCompaniesAdmin(klien),
  });

  const lowongan: JobAdmin | null =
    mode === "ubah" ? (daftar.data?.find((j) => j.id === id) ?? null) : null;

  const [nilai, setNilai] = useState<NilaiLowongan>(NILAI_KOSONG);
  // Penjaga "isi SEKALI" — pola sama `admin-companies-formulir.tsx`: pemuatan
  // ulang di latar belakang (mis. sesudah terbitkan) tidak boleh menimpa
  // isian yang sedang diketik admin.
  const [sudahDiisi, setSudahDiisi] = useState(mode === "buat");
  const [galat, setGalat] = useState<GalatKolom>({});
  const [kabar, setKabar] = useState("");
  const [dialogTutup, setDialogTutup] = useState(false);

  useEffect(() => {
    if (mode === "ubah" && lowongan !== null && !sudahDiisi) {
      setNilai(keNilai(lowongan));
      setSudahDiisi(true);
    }
  }, [mode, lowongan, sudahDiisi]);

  const namaHalaman =
    mode === "buat"
      ? t("admin.jobs.form.judulBuat")
      : t("admin.jobs.form.judulUbah", { judul: lowongan?.title ?? nilai.title });
  useJudulHalaman(t("shell.judulDokumen", { halaman: namaHalaman }));

  function perbaruiBaris(hasil: JobAdmin): void {
    queryClient.setQueryData<JobAdmin[]>(jobsKeys.adminList(), (sebelum) => {
      if (sebelum === undefined) return sebelum;
      const ada = sebelum.some((j) => j.id === hasil.id);
      return ada ? sebelum.map((j) => (j.id === hasil.id ? hasil : j)) : [...sebelum, hasil];
    });
  }

  const simpan = useMutation({
    mutationFn: (badan: BuatLowongan | UbahLowongan) =>
      mode === "buat"
        ? createJobAdmin(klien, badan as BuatLowongan)
        : updateJobAdmin(klien, id as string, badan as UbahLowongan),
    onSuccess: (hasil) => {
      perbaruiBaris(hasil);
      if (mode === "buat") {
        // Buat → LANGSUNG ke halaman ubah lowongan baru: pola sama companies
        // (AC "buat→edit" satu alur berkelanjutan; tombol Terbitkan ada di
        // halaman ubah, bukan di halaman buat).
        navigate(`/admin/jobs/${hasil.id}`, { replace: true });
        return;
      }
      setKabar(t("admin.jobs.form.diubah", { judul: hasil.title }));
    },
  });

  const terbitkan = useMutation({
    mutationFn: () => publishJobAdmin(klien, id as string),
    onSuccess: (hasil) => {
      perbaruiBaris(hasil);
      setKabar(t("admin.jobs.terbitkan.berhasil", { judul: hasil.title }));
    },
  });

  const tutup = useMutation({
    mutationFn: () => closeJobAdmin(klien, id as string),
    onSuccess: (hasil) => {
      perbaruiBaris(hasil);
      setKabar(t("admin.jobs.tutup.berhasil", { judul: hasil.title }));
    },
  });

  function kirim(): void {
    setKabar("");
    const hasil =
      mode === "buat"
        ? periksa(createJobSchema, keBadanBuat(nilai))
        : periksa(updateJobSchema, keBadanUbah(nilai));
    if (!hasil.ok) {
      setGalat(hasil.galat);
      return;
    }
    setGalat({});
    simpan.mutate(hasil.nilai);
  }

  const akomodasiKosong = lowongan !== null && lowongan.accommodations.length === 0;

  const galatUmum =
    Object.keys(galat).length > 0
      ? t("admin.jobs.galat.periksaKolom")
      : simpan.isError
        ? pesanGalatSimpan(simpan.error, t)
        : null;

  const opsiPerusahaan = (perusahaan.data ?? []).map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/admin/jobs"
        className="text-base font-medium text-gray-900 underline hover:no-underline"
      >
        {t("admin.jobs.form.kembaliKeDaftar")}
      </Link>

      <h2 className="text-2xl font-semibold text-gray-900">{namaHalaman}</h2>

      {mode === "ubah" && daftar.isError && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{pesanGalatSimpan(daftar.error, t)}</p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void daftar.refetch();
            }}
          >
            {t("admin.jobs.cobaLagi")}
          </Tombol>
        </div>
      )}

      {mode === "ubah" && !daftar.isError && (
        <WilayahMemuat memuat={daftar.isPending} label={t("admin.jobs.memuat")}>
          {lowongan === null ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-base font-medium text-red-700">
                {t("admin.jobs.form.tidakDitemukan")}
              </p>
              <Link
                to="/admin/jobs"
                className="text-base font-medium text-gray-900 underline hover:no-underline"
              >
                {t("admin.jobs.form.kembaliKeDaftar")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <JobStatusBadge status={lowongan.status} />

                {lowongan.status === "draft" && (
                  <div className="flex flex-col gap-1">
                    <Tombol
                      varian="sekunder"
                      ukuran="kecil"
                      aria-disabled={terbitkan.isPending || akomodasiKosong}
                      aria-busy={terbitkan.isPending}
                      onClick={() => {
                        if (terbitkan.isPending || akomodasiKosong) return;
                        terbitkan.mutate();
                      }}
                    >
                      {terbitkan.isPending
                        ? t("admin.jobs.terbitkan.sedang")
                        : t("admin.jobs.terbitkan.tombol")}
                    </Tombol>
                    {akomodasiKosong && (
                      <p className="text-sm text-gray-700">
                        {t("admin.jobs.terbitkan.akomodasiWajib")}
                      </p>
                    )}
                  </div>
                )}

                {lowongan.status === "published" && (
                  <Tombol
                    varian="sekunder"
                    ukuran="kecil"
                    aria-disabled={tutup.isPending}
                    aria-busy={tutup.isPending}
                    onClick={() => {
                      if (tutup.isPending) return;
                      setDialogTutup(true);
                    }}
                  >
                    {tutup.isPending ? t("admin.jobs.tutup.sedang") : t("admin.jobs.tutup.tombol")}
                  </Tombol>
                )}
              </div>

              {terbitkan.isError && (
                <p role="alert" className="text-base font-medium text-red-700">
                  {pesanGalatSimpan(terbitkan.error, t)}
                </p>
              )}
              {tutup.isError && (
                <p role="alert" className="text-base font-medium text-red-700">
                  {pesanGalatSimpan(tutup.error, t)}
                </p>
              )}
            </div>
          )}
        </WilayahMemuat>
      )}

      {(mode === "buat" || lowongan !== null) && (
        <>
          <FormulirLowongan
            mode={mode}
            nilai={nilai}
            onUbah={(baru) => {
              setNilai(baru);
              // Keberhasilan sebelumnya tidak lagi menggambarkan isi formulir
              // begitu satu huruf berubah — pola sama `Profil`/companies.
              simpan.reset();
            }}
            galat={galat}
            sedangMenyimpan={simpan.isPending}
            onSimpan={kirim}
            onBatal={() => {
              navigate("/admin/jobs");
            }}
            namaForm={namaHalaman}
            perusahaanOpsi={opsiPerusahaan}
          />

          {galatUmum !== null && (
            <p role="alert" className="text-base font-medium text-red-700">
              {galatUmum}
            </p>
          )}

          <p role="status" className="text-base text-gray-900">
            {kabar}
          </p>
        </>
      )}

      {mode === "ubah" && lowongan !== null && (
        <Dialog
          judul={t("admin.jobs.tutup.dialogJudul", { judul: lowongan.title })}
          deskripsi={t("admin.jobs.tutup.dialogDeskripsi")}
          terbuka={dialogTutup}
          onUbahTerbuka={setDialogTutup}
          labelTutup={t("admin.jobs.tutup.dialogBatal")}
          aksi={
            <>
              <Tombol
                aria-disabled={tutup.isPending}
                aria-busy={tutup.isPending}
                onClick={() => {
                  if (tutup.isPending) return;
                  setDialogTutup(false);
                  tutup.mutate();
                }}
              >
                {t("admin.jobs.tutup.dialogYa")}
              </Tombol>
              <Tombol
                varian="sekunder"
                onClick={() => {
                  setDialogTutup(false);
                }}
              >
                {t("admin.jobs.tutup.dialogBatal")}
              </Tombol>
            </>
          }
        >
          <p className="flex flex-wrap items-center gap-2 text-base text-gray-900">
            <JobStatusBadge status="published" />
            <span aria-hidden="true">→</span>
            <JobStatusBadge status="closed" />
          </p>
        </Dialog>
      )}
    </div>
  );
}
