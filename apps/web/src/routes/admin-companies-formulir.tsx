// Halaman "/admin/companies/baru" DAN "/admin/companies/:id" — satu komponen
// untuk keduanya (PR-053), sama alasannya dengan `DaftarKarier`: alur
// buat/ubah identik, dan salinan kedua adalah tempat salah satunya lupa
// divalidasi.
//
// TIDAK ADA GET SATU PERUSAHAAN (lihat catatan `companies.ts` di
// `@nawasena/api-client`). Mode UBAH karena itu mencari barisnya dari
// `listCompaniesAdmin` yang sama dengan yang dipakai halaman daftar — cache
// TanStack yang sudah terisi (datang dari `/admin/companies`) membuat
// perpindahan ke sini terasa seketika; navigasi LANGSUNG ke alamat ini
// (tautan disalin, dibuka tab baru) tetap bekerja lewat satu permintaan segar.
//
// STATUS VERIFIKASI ADALAH AKSI TERPISAH DARI "Simpan" — lihat alasannya di
// `companies-badan.ts`. Tombol Verifikasi HANYA tampil bila belum verified;
// un-verify tidak ada di UI ini (di luar scope PR-053 — AC-nya tidak
// memintanya, dan PUT admin/PR-051 tetap menyediakan jalurnya di server bila
// kelak dibutuhkan).
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import {
  companiesKeys,
  createCompanyAdmin,
  listCompaniesAdmin,
  updateCompanyAdmin,
  verifyCompanyAdmin,
  type BuatPerusahaan,
  type UbahPerusahaan,
} from "@nawasena/api-client";
import { createCompanySchema, updateCompanySchema, type CompanyAdmin } from "@nawasena/schemas";
import { Dialog, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useKlienApi } from "../app/klien-api.js";
// Impor per berkas, bukan barrel `features/admin/index.js` — lihat alasan
// yang sama di `routes/admin-companies.tsx` (halaman daftar): agar penjaga
// pemuatan malas hanya melihat katalog yang BENAR-BENAR dipakai halaman ini.
import {
  keBadanBuat,
  keBadanUbah,
  keNilai,
  NILAI_KOSONG,
  type NilaiPerusahaan,
} from "../features/admin/companies-badan.js";
import { FormulirPerusahaan } from "../features/admin/companies-formulir.js";
import { StatusBadge } from "../features/admin/companies-status-badge.js";
import {
  periksa,
  pesanGalatSimpan,
  type GalatKolom,
} from "../features/admin/companies-pesan-galat.js";

export function AdminCompaniesFormulir() {
  const t = useTeks();
  const klien = useKlienApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id?: string }>();
  const mode: "buat" | "ubah" = id === undefined ? "buat" : "ubah";

  // Mode UBAH saja yang butuh daftar — mode BUAT tidak punya apa pun untuk
  // dicari. `enabled: false` mencegah permintaan yang jawabannya tidak dipakai.
  const daftar = useQuery({
    queryKey: companiesKeys.adminList(),
    queryFn: () => listCompaniesAdmin(klien),
    enabled: mode === "ubah",
  });

  const perusahaan: CompanyAdmin | null =
    mode === "ubah" ? (daftar.data?.find((p) => p.id === id) ?? null) : null;

  const [nilai, setNilai] = useState<NilaiPerusahaan>(NILAI_KOSONG);
  // Penjaga "isi SEKALI" — pola sama dengan `routes/profil.tsx`: pemuatan
  // ulang di latar belakang (mis. sesudah verifikasi) tidak boleh menimpa
  // isian yang sedang diketik admin.
  const [sudahDiisi, setSudahDiisi] = useState(mode === "buat");
  const [galat, setGalat] = useState<GalatKolom>({});
  const [kabar, setKabar] = useState("");
  const [dialogVerifikasi, setDialogVerifikasi] = useState(false);

  useEffect(() => {
    if (mode === "ubah" && perusahaan !== null && !sudahDiisi) {
      setNilai(keNilai(perusahaan));
      setSudahDiisi(true);
    }
  }, [mode, perusahaan, sudahDiisi]);

  const namaHalaman =
    mode === "buat"
      ? t("admin.companies.form.judulBuat")
      : t("admin.companies.form.judulUbah", { nama: perusahaan?.name ?? nilai.name });
  useJudulHalaman(t("shell.judulDokumen", { halaman: namaHalaman }));

  function perbaruiBaris(hasil: CompanyAdmin): void {
    queryClient.setQueryData<CompanyAdmin[]>(companiesKeys.adminList(), (sebelum) => {
      if (sebelum === undefined) return sebelum;
      const ada = sebelum.some((p) => p.id === hasil.id);
      return ada ? sebelum.map((p) => (p.id === hasil.id ? hasil : p)) : [...sebelum, hasil];
    });
  }

  const simpan = useMutation({
    mutationFn: (badan: BuatPerusahaan | UbahPerusahaan) =>
      mode === "buat"
        ? createCompanyAdmin(klien, badan as BuatPerusahaan)
        : updateCompanyAdmin(klien, id as string, badan as UbahPerusahaan),
    onSuccess: (hasil) => {
      perbaruiBaris(hasil);
      if (mode === "buat") {
        // Buat → LANGSUNG ke halaman ubah perusahaan baru: AC "Buat→edit→
        // verifikasi end-to-end" adalah satu alur berkelanjutan, dan tombol
        // Verifikasi ada di halaman ubah, bukan di halaman buat.
        navigate(`/admin/companies/${hasil.id}`, { replace: true });
        return;
      }
      setKabar(t("admin.companies.form.diubah", { nama: hasil.name }));
    },
  });

  const verifikasi = useMutation({
    mutationFn: () => verifyCompanyAdmin(klien, id as string),
    onSuccess: (hasil) => {
      perbaruiBaris(hasil);
      setKabar(t("admin.companies.verifikasi.berhasil", { nama: hasil.name }));
    },
  });

  function kirim(): void {
    setKabar("");
    const hasil =
      mode === "buat"
        ? periksa(createCompanySchema, keBadanBuat(nilai))
        : periksa(updateCompanySchema, keBadanUbah(nilai));
    if (!hasil.ok) {
      setGalat(hasil.galat);
      return;
    }
    setGalat({});
    simpan.mutate(hasil.nilai);
  }

  const galatUmum =
    Object.keys(galat).length > 0
      ? t("admin.companies.galat.periksaKolom")
      : simpan.isError
        ? pesanGalatSimpan(simpan.error, t)
        : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/admin/companies"
        className="text-base font-medium text-gray-900 underline hover:no-underline"
      >
        {t("admin.companies.form.kembaliKeDaftar")}
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
            {t("admin.companies.cobaLagi")}
          </Tombol>
        </div>
      )}

      {mode === "ubah" && !daftar.isError && (
        <WilayahMemuat memuat={daftar.isPending} label={t("admin.companies.memuat")}>
          {perusahaan === null ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-base font-medium text-red-700">
                {t("admin.companies.form.tidakDitemukan")}
              </p>
              <Link
                to="/admin/companies"
                className="text-base font-medium text-gray-900 underline hover:no-underline"
              >
                {t("admin.companies.form.kembaliKeDaftar")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={perusahaan.inclusivityStatus} />
                {perusahaan.inclusivityStatus !== "verified" && (
                  <Tombol
                    varian="sekunder"
                    ukuran="kecil"
                    aria-disabled={verifikasi.isPending}
                    aria-busy={verifikasi.isPending}
                    onClick={() => {
                      if (verifikasi.isPending) return;
                      setDialogVerifikasi(true);
                    }}
                  >
                    {verifikasi.isPending
                      ? t("admin.companies.verifikasi.sedang")
                      : t("admin.companies.verifikasi.tombol")}
                  </Tombol>
                )}
              </div>

              {verifikasi.isError && (
                <p role="alert" className="text-base font-medium text-red-700">
                  {pesanGalatSimpan(verifikasi.error, t)}
                </p>
              )}
            </div>
          )}
        </WilayahMemuat>
      )}

      {(mode === "buat" || perusahaan !== null) && (
        <>
          <FormulirPerusahaan
            nilai={nilai}
            onUbah={(baru) => {
              setNilai(baru);
              // Keberhasilan sebelumnya tidak lagi menggambarkan isi formulir
              // begitu satu huruf berubah — alasan yang sama dengan `Profil`.
              simpan.reset();
            }}
            galat={galat}
            sedangMenyimpan={simpan.isPending}
            onSimpan={kirim}
            onBatal={() => {
              navigate("/admin/companies");
            }}
            namaForm={namaHalaman}
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

      {mode === "ubah" && perusahaan !== null && (
        <Dialog
          judul={t("admin.companies.verifikasi.dialogJudul", { nama: perusahaan.name })}
          deskripsi={t("admin.companies.verifikasi.dialogDeskripsi")}
          terbuka={dialogVerifikasi}
          onUbahTerbuka={setDialogVerifikasi}
          labelTutup={t("admin.companies.verifikasi.dialogBatal")}
          aksi={
            <>
              <Tombol
                aria-disabled={verifikasi.isPending}
                aria-busy={verifikasi.isPending}
                onClick={() => {
                  if (verifikasi.isPending) return;
                  setDialogVerifikasi(false);
                  verifikasi.mutate();
                }}
              >
                {t("admin.companies.verifikasi.dialogYa")}
              </Tombol>
              <Tombol
                varian="sekunder"
                onClick={() => {
                  setDialogVerifikasi(false);
                }}
              >
                {t("admin.companies.verifikasi.dialogBatal")}
              </Tombol>
            </>
          }
        >
          {/*
            Isi dialog menyebut PERUBAHAN status secara eksplisit — badge
            "sekarang" (StatusBadge) berbeda dari badge "sesudahnya", supaya
            perbedaannya tidak hanya terlihat lewat kata "verified" di
            deskripsi.
          */}
          <p className="flex flex-wrap items-center gap-2 text-base text-gray-900">
            <StatusBadge status={perusahaan.inclusivityStatus} />
            <span aria-hidden="true">→</span>
            <StatusBadge status="verified" />
          </p>
        </Dialog>
      )}
    </div>
  );
}
