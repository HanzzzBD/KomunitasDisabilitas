// Halaman "/admin/kamus/baru" DAN "/admin/kamus/:id" (PR-085b) — satu komponen,
// pola sama `admin-jobs-formulir.tsx`.
//
// URUTAN KERJA TIM KONTEN: isi frasa + kategori → Simpan (draft lahir, pindah ke
// halaman ubah) → unggah video, caption, thumbnail (slot per berkas) → isi
// transkrip → Terbitkan. Slot unggah hanya ada di mode UBAH, karena izin unggah
// butuh id entri.
//
// TERBITKAN NONAKTIF selama entri TERSIMPAN belum lengkap, dengan daftar yang
// kurang tertulis di bawahnya (cermin server 422). TARIK ke draft WAJIB dialog:
// dampaknya publik — pengguna Tuli yang sedang membuka entri itu kehilangannya.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import {
  createSignVideoAdmin,
  listSignVideosAdmin,
  publishSignVideoAdmin,
  signVideosKeys,
  unpublishSignVideoAdmin,
  updateSignVideoAdmin,
  type BuatEntriKamus,
  type UbahEntriKamus,
} from "@nawasena/api-client";
import {
  createSignVideoSchema,
  updateSignVideoSchema,
  type SignVideoAdmin,
  type SignVideoCategory,
} from "@nawasena/schemas";
import { AreaTeks, Dialog, KolomForm, Masukan, Pilihan, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useKlienApi } from "../app/klien-api.js";
import {
  KATEGORI_KAMUS,
  kekuranganKamus,
  keBadanBuat,
  keBadanUbah,
  keNilai,
  NILAI_KOSONG,
  type NilaiKamus,
} from "../features/admin/kamus-badan.js";
import { pesanGalatKamus } from "../features/admin/kamus-pesan-galat.js";
import { SlotUnggah } from "../features/admin/kamus-slot-unggah.js";
import { JobStatusBadge } from "../features/admin/jobs-status-badge.js";
import { periksa, type GalatKolom } from "../features/admin/jobs-pesan-galat.js";

export function AdminKamusFormulir() {
  const t = useTeks();
  const klien = useKlienApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id?: string }>();
  const mode: "buat" | "ubah" = id === undefined ? "buat" : "ubah";

  const daftar = useQuery({
    queryKey: signVideosKeys.adminList(),
    queryFn: () => listSignVideosAdmin(klien),
    enabled: mode === "ubah",
  });
  const entri: SignVideoAdmin | null =
    mode === "ubah" ? (daftar.data?.find((v) => v.id === id) ?? null) : null;

  const [nilai, setNilai] = useState<NilaiKamus>(NILAI_KOSONG);
  const [sudahDiisi, setSudahDiisi] = useState(mode === "buat");
  const [galat, setGalat] = useState<GalatKolom>({});
  const [kabar, setKabar] = useState("");
  const [dialogTarik, setDialogTarik] = useState(false);

  useEffect(() => {
    if (mode === "ubah" && entri !== null && !sudahDiisi) {
      setNilai(keNilai(entri));
      setSudahDiisi(true);
    }
  }, [mode, entri, sudahDiisi]);

  const namaHalaman =
    mode === "buat"
      ? t("admin.kamus.form.judulBuat")
      : t("admin.kamus.form.judulUbah", { frasa: entri?.phrase ?? nilai.phrase });
  useJudulHalaman(t("shell.judulDokumen", { halaman: namaHalaman }));

  function perbaruiBaris(hasil: SignVideoAdmin): void {
    queryClient.setQueryData<SignVideoAdmin[]>(signVideosKeys.adminList(), (sebelum) => {
      if (sebelum === undefined) return sebelum;
      return sebelum.some((v) => v.id === hasil.id)
        ? sebelum.map((v) => (v.id === hasil.id ? hasil : v))
        : [hasil, ...sebelum];
    });
  }

  const simpan = useMutation({
    mutationFn: (badan: BuatEntriKamus | UbahEntriKamus) =>
      mode === "buat"
        ? createSignVideoAdmin(klien, badan as BuatEntriKamus)
        : updateSignVideoAdmin(klien, id as string, badan as UbahEntriKamus),
    onSuccess: (hasil) => {
      perbaruiBaris(hasil);
      if (mode === "buat") {
        navigate(`/admin/kamus/${hasil.id}`, { replace: true });
        return;
      }
      setKabar(t("admin.kamus.form.disimpan", { frasa: hasil.phrase }));
    },
  });

  const terbitkan = useMutation({
    mutationFn: () => publishSignVideoAdmin(klien, id as string),
    onSuccess: (hasil) => {
      perbaruiBaris(hasil);
      setKabar(t("admin.kamus.terbitkan.berhasil", { frasa: hasil.phrase }));
    },
  });

  const tarik = useMutation({
    mutationFn: () => unpublishSignVideoAdmin(klien, id as string),
    onSuccess: (hasil) => {
      perbaruiBaris(hasil);
      setKabar(t("admin.kamus.tarik.berhasil", { frasa: hasil.phrase }));
    },
  });

  function kirim(): void {
    setKabar("");
    const hasil =
      mode === "buat"
        ? periksa(createSignVideoSchema, keBadanBuat(nilai))
        : periksa(updateSignVideoSchema, keBadanUbah(nilai));
    if (!hasil.ok) {
      setGalat(hasil.galat);
      return;
    }
    setGalat({});
    simpan.mutate(hasil.nilai);
  }

  const kurang = entri === null ? [] : kekuranganKamus(entri);
  const galatUmum =
    Object.keys(galat).length > 0
      ? t("admin.kamus.form.periksaKolom")
      : simpan.isError
        ? pesanGalatKamus(simpan.error, t)
        : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/admin/kamus"
        className="text-base font-medium text-gray-900 underline hover:no-underline"
      >
        {t("admin.kamus.form.kembali")}
      </Link>
      <h2 className="text-2xl font-semibold text-gray-900">{namaHalaman}</h2>

      {mode === "ubah" && daftar.isError && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{pesanGalatKamus(daftar.error, t)}</p>
          <Tombol
            varian="sekunder"
            onClick={() => {
              void daftar.refetch();
            }}
          >
            {t("admin.kamus.cobaLagi")}
          </Tombol>
        </div>
      )}

      {mode === "ubah" && !daftar.isError && (
        <WilayahMemuat memuat={daftar.isPending} label={t("admin.kamus.memuat")}>
          {entri === null ? (
            <p role="alert" className="text-base font-medium text-red-700">
              {t("admin.kamus.galat.tidakDitemukan")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <JobStatusBadge status={entri.status} />
                {entri.status === "draft" ? (
                  <Tombol
                    varian="sekunder"
                    ukuran="kecil"
                    aria-disabled={terbitkan.isPending || kurang.length > 0}
                    aria-busy={terbitkan.isPending}
                    aria-describedby={kurang.length > 0 ? "kamus-syarat-terbit" : undefined}
                    onClick={() => {
                      if (terbitkan.isPending || kurang.length > 0) return;
                      terbitkan.mutate();
                    }}
                  >
                    {terbitkan.isPending
                      ? t("admin.kamus.terbitkan.sedang")
                      : t("admin.kamus.terbitkan.tombol")}
                  </Tombol>
                ) : (
                  <Tombol
                    varian="sekunder"
                    ukuran="kecil"
                    aria-disabled={tarik.isPending}
                    aria-busy={tarik.isPending}
                    onClick={() => {
                      if (!tarik.isPending) setDialogTarik(true);
                    }}
                  >
                    {tarik.isPending
                      ? t("admin.kamus.tarik.sedang")
                      : t("admin.kamus.tarik.tombol")}
                  </Tombol>
                )}
              </div>
              {entri.status === "draft" && kurang.length > 0 && (
                <p id="kamus-syarat-terbit" className="text-sm text-gray-700">
                  {t("admin.kamus.terbitkan.syarat", {
                    daftar: kurang.map((k) => t(k)).join(", "),
                  })}
                </p>
              )}
              {terbitkan.isError && (
                <p role="alert" className="text-base font-medium text-red-700">
                  {pesanGalatKamus(terbitkan.error, t)}
                </p>
              )}
              {tarik.isError && (
                <p role="alert" className="text-base font-medium text-red-700">
                  {pesanGalatKamus(tarik.error, t)}
                </p>
              )}
            </div>
          )}
        </WilayahMemuat>
      )}

      {(mode === "buat" || entri !== null) && (
        <form
          aria-label={namaHalaman}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!simpan.isPending) kirim();
          }}
        >
          <h3 className="text-lg font-semibold text-gray-900">{t("admin.kamus.form.bagianIsi")}</h3>
          <KolomForm label={t("admin.kamus.form.frasa")} wajib galat={galat.phrase}>
            <Masukan
              value={nilai.phrase}
              maxLength={120}
              onChange={(e) => {
                setNilai({ ...nilai, phrase: e.target.value });
                simpan.reset();
              }}
            />
          </KolomForm>
          <KolomForm label={t("admin.kamus.form.kategori")} wajib galat={galat.category}>
            <Pilihan
              opsi={KATEGORI_KAMUS.map((k) => ({
                nilai: k,
                label: t(`admin.kamus.kategori.${k}`),
              }))}
              nilai={nilai.category}
              placeholder={t("admin.kamus.form.kategoriPlaceholder")}
              onUbah={(dipilih) => {
                setNilai({ ...nilai, category: dipilih as SignVideoCategory });
                simpan.reset();
              }}
            />
          </KolomForm>
          <KolomForm
            label={t("admin.kamus.form.transkrip")}
            bantuan={t("admin.kamus.form.transkripBantuan")}
            galat={galat.transcript}
          >
            <AreaTeks
              value={nilai.transcript}
              rows={4}
              maxLength={2000}
              onChange={(e) => {
                setNilai({ ...nilai, transcript: e.target.value });
                simpan.reset();
              }}
            />
          </KolomForm>
          <div className="flex flex-wrap gap-3">
            <Tombol type="submit" aria-busy={simpan.isPending} aria-disabled={simpan.isPending}>
              {simpan.isPending ? t("admin.kamus.form.menyimpan") : t("admin.kamus.form.simpan")}
            </Tombol>
            <Tombol
              varian="sekunder"
              onClick={() => {
                navigate("/admin/kamus");
              }}
            >
              {t("admin.kamus.form.batal")}
            </Tombol>
          </div>
          {galatUmum !== null && (
            <p role="alert" className="text-base font-medium text-red-700">
              {galatUmum}
            </p>
          )}
        </form>
      )}

      {mode === "ubah" && entri !== null && (
        <section aria-labelledby="kamus-media-judul" className="flex flex-col gap-3">
          <h3 id="kamus-media-judul" className="text-lg font-semibold text-gray-900">
            {t("admin.kamus.form.bagianMedia")}
          </h3>
          <p className="text-base text-gray-900">{t("admin.kamus.form.mediaPenjelasan")}</p>
          {(["video", "caption", "thumbnail"] as const).map((kind) => (
            <SlotUnggah
              key={kind}
              kind={kind}
              entri={entri}
              klien={klien}
              onTersimpan={perbaruiBaris}
            />
          ))}
        </section>
      )}

      <p role="status" className="text-base text-gray-900">
        {kabar}
      </p>

      {mode === "ubah" && entri !== null && (
        <Dialog
          judul={t("admin.kamus.tarik.dialogJudul", { frasa: entri.phrase })}
          deskripsi={t("admin.kamus.tarik.dialogDeskripsi")}
          terbuka={dialogTarik}
          onUbahTerbuka={setDialogTarik}
          labelTutup={t("admin.kamus.tarik.dialogBatal")}
          aksi={
            <>
              <Tombol
                onClick={() => {
                  setDialogTarik(false);
                  tarik.mutate();
                }}
              >
                {t("admin.kamus.tarik.dialogYa")}
              </Tombol>
              <Tombol
                varian="sekunder"
                onClick={() => {
                  setDialogTarik(false);
                }}
              >
                {t("admin.kamus.tarik.dialogBatal")}
              </Tombol>
            </>
          }
        >
          <p className="flex flex-wrap items-center gap-2 text-base text-gray-900">
            <JobStatusBadge status="published" />
            <span aria-hidden="true">→</span>
            <JobStatusBadge status="draft" />
          </p>
        </Dialog>
      )}
    </div>
  );
}
