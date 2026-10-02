// Detail lamaran admin (PR-077b) — kontak, CV, riwayat, ubah status, dan
// pembukaan data yang diungkap.
//
// TUJUAN STATUS DIHITUNG DARI MESIN YANG SAMA DENGAN SERVER
// (`tujuanStatusSah`, @nawasena/schemas). Pilihan yang ditawarkan karena itu
// selalu sah; server tetap menegakkannya, dan 409 dari perubahan yang
// bersilangan diterjemahkan menjadi ajakan memuat ulang.
//
// DATA YANG DIUNGKAP TIDAK PERNAH MASUK CACHE TANSTACK (keputusan owner
// 2026-10-02: tersembunyi bawaan, dibuka dengan alasan, setiap pembukaan
// diaudit). Hasil pembukaan disimpan di state komponen ini saja: meninggalkan
// halaman = datanya hilang dari memori, dan membuka lagi = jejak audit baru.
import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  applicationsKeys,
  revealDisclosureAdmin,
  updateApplicationStatusAdmin,
  type ApiClient,
} from "@nawasena/api-client";
import {
  adminReasonSchema,
  tujuanStatusSah,
  type AccommodationNeed,
  type AdminApplicationDetail,
  type ApplicationStatus,
  type DisclosureSnapshot,
} from "@nawasena/schemas";
import { AreaTeks, Dialog, Kartu, KolomForm, Pilihan, Tombol } from "@nawasena/ui";
import { RAGAM } from "../onboarding/langkah-ragam-disabilitas.js";
import { useTeks, type FungsiTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { KUNCI_STATUS_LAMARAN, LamaranStatusBadge } from "./lamaran-status-badge.js";
import { TANGGAL_LAMARAN } from "./lamaran-daftar.js";
import { pesanGalatLamaran } from "./lamaran-pesan-galat.js";

/** Sama persis dengan `KUNCI_AKOMODASI` di `jobs-formulir.tsx`. */
const KUNCI_AKOMODASI: Readonly<Record<AccommodationNeed, KunciTeks>> = {
  akses_kursi_roda: "profil.akomodasi.akses_kursi_roda",
  ramah_screen_reader: "profil.akomodasi.ramah_screen_reader",
  wawancara_via_teks: "profil.akomodasi.wawancara_via_teks",
  jam_kerja_fleksibel: "profil.akomodasi.jam_kerja_fleksibel",
  ruang_kerja_tenang: "profil.akomodasi.ruang_kerja_tenang",
  juru_bahasa_isyarat: "profil.akomodasi.juru_bahasa_isyarat",
};

const KUNCI_RAGAM: Readonly<Record<string, KunciTeks>> = Object.fromEntries(
  RAGAM.map((r) => [r.nilai, r.kunci]),
);

const WAKTU = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** Galat alasan per kolom — pesan katalog, bukan pesan zod mentah. */
function periksaAlasan(
  alasan: string,
  t: FungsiTeks,
  kunciKosong: KunciTeks = "admin.lamaran.ubah.galat.alasanKosong",
): string | undefined {
  const hasil = adminReasonSchema.safeParse(alasan);
  if (hasil.success) return undefined;
  return alasan.trim() === "" ? t(kunciKosong) : t("admin.lamaran.ubah.galat.alasanPanjang");
}

function Baris({ label, isi }: { label: string; isi: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="font-semibold text-gray-900 sm:min-w-40">{label}</dt>
      <dd className="m-0 break-words text-gray-900">{isi}</dd>
    </div>
  );
}

export interface DetailLamaranProps {
  klien: ApiClient;
  lamaran: AdminApplicationDetail;
}

export function DetailLamaran({ klien, lamaran }: DetailLamaranProps) {
  const t = useTeks();
  const nama = lamaran.applicant.fullName ?? t("admin.lamaran.akunDihapus");
  const tidakAda = t("admin.lamaran.detail.tidakAda");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold break-words text-gray-900">
        {t("admin.lamaran.detail.judul", { nama })}
      </h2>

      <Kartu judul={t("admin.lamaran.detail.ringkasanJudul")} tingkatJudul={3}>
        <dl className="m-0 flex flex-col gap-2 text-base">
          <Baris
            label={t("admin.lamaran.kolom.lowongan")}
            isi={
              lamaran.job === null
                ? t("admin.lamaran.lowonganTakDikenal")
                : `${lamaran.job.title} — ${lamaran.job.companyName}`
            }
          />
          <Baris
            label={t("admin.lamaran.kolom.tanggal")}
            isi={TANGGAL_LAMARAN.format(new Date(lamaran.appliedAt))}
          />
          <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt className="font-semibold text-gray-900 sm:min-w-40">
              {t("admin.lamaran.detail.statusSekarang")}
            </dt>
            <dd className="m-0">
              <LamaranStatusBadge status={lamaran.status} />
            </dd>
          </div>
        </dl>
        {lamaran.job !== null && !lamaran.job.aktif && (
          <p className="mt-2 text-base text-gray-900">{t("admin.lamaran.detail.lowonganTutup")}</p>
        )}
        {lamaran.hiredConfirmedAt !== null && (
          <p className="mt-2 text-base font-medium text-green-900">
            {t("admin.lamaran.detail.terkonfirmasi", {
              tanggal: TANGGAL_LAMARAN.format(new Date(lamaran.hiredConfirmedAt)),
            })}
          </p>
        )}
      </Kartu>

      <Kartu judul={t("admin.lamaran.detail.kontakJudul")} tingkatJudul={3}>
        <dl className="m-0 flex flex-col gap-2 text-base">
          <Baris label={t("admin.lamaran.detail.nama")} isi={nama} />
          <Baris
            label={t("admin.lamaran.detail.telepon")}
            isi={lamaran.applicant.phone ?? tidakAda}
          />
          <Baris
            label={t("admin.lamaran.detail.email")}
            isi={lamaran.applicant.email ?? tidakAda}
          />
        </dl>
      </Kartu>

      <CvTerlampir lamaran={lamaran} />
      <Riwayat lamaran={lamaran} />
      <UbahStatus klien={klien} lamaran={lamaran} />
      <Pengungkapan klien={klien} lamaran={lamaran} />
    </div>
  );
}

function CvTerlampir({ lamaran }: { lamaran: AdminApplicationDetail }) {
  const t = useTeks();
  const cv = lamaran.resume;
  return (
    <Kartu judul={t("admin.lamaran.detail.cvJudul")} tingkatJudul={3}>
      {cv === null ? (
        <p className="text-base text-gray-900">{t("admin.lamaran.detail.cvTanpa")}</p>
      ) : (
        <div className="flex flex-col gap-3 text-base text-gray-900">
          <p className="font-semibold">{cv.title}</p>
          {cv.content.headline !== null && <p>{cv.content.headline}</p>}
          {cv.content.summary !== null && (
            <section aria-label={t("admin.lamaran.detail.cvRingkasan")}>
              <h4 className="font-semibold">{t("admin.lamaran.detail.cvRingkasan")}</h4>
              <p className="whitespace-pre-line">{cv.content.summary}</p>
            </section>
          )}
          {cv.content.experiences.length > 0 && (
            <section>
              <h4 className="font-semibold">{t("admin.lamaran.detail.cvPengalaman")}</h4>
              <ul className="list-disc pl-6">
                {cv.content.experiences.map((p, i) => (
                  <li key={i}>{p.company === null ? p.title : `${p.title} — ${p.company}`}</li>
                ))}
              </ul>
            </section>
          )}
          {cv.content.educations.length > 0 && (
            <section>
              <h4 className="font-semibold">{t("admin.lamaran.detail.cvPendidikan")}</h4>
              <ul className="list-disc pl-6">
                {cv.content.educations.map((p, i) => (
                  <li key={i}>
                    {[p.institution, p.degree, p.field].filter((x) => x !== null).join(" — ")}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {cv.content.skills.length > 0 && (
            <section>
              <h4 className="font-semibold">{t("admin.lamaran.detail.cvKeahlian")}</h4>
              <p>{cv.content.skills.map((k) => k.name).join(", ")}</p>
            </section>
          )}
        </div>
      )}
    </Kartu>
  );
}

/** Riwayat = ORDERED LIST semantik, terlama dulu — screen reader membaca kronologinya. */
function Riwayat({ lamaran }: { lamaran: AdminApplicationDetail }) {
  const t = useTeks();
  return (
    <Kartu judul={t("admin.lamaran.detail.riwayatJudul")} tingkatJudul={3}>
      {lamaran.statusHistory.length === 0 ? (
        <p className="text-base text-gray-900">{t("admin.lamaran.detail.riwayatKosong")}</p>
      ) : (
        <ol className="flex list-decimal flex-col gap-1 pl-6 text-base text-gray-900">
          {lamaran.statusHistory.map((e, i) => (
            <li key={i}>
              {t("admin.lamaran.detail.riwayatEntri", {
                ke: t(KUNCI_STATUS_LAMARAN[e.to]),
                dari: t(KUNCI_STATUS_LAMARAN[e.from]),
                oleh: t(
                  e.by === "admin"
                    ? "admin.lamaran.detail.oleh.admin"
                    : "admin.lamaran.detail.oleh.seeker",
                ),
                waktu: WAKTU.format(new Date(e.at)),
              })}
            </li>
          ))}
        </ol>
      )}
    </Kartu>
  );
}

function UbahStatus({ klien, lamaran }: DetailLamaranProps) {
  const t = useTeks();
  const queryClient = useQueryClient();
  const tujuan = tujuanStatusSah(lamaran.status, "admin");
  const [ke, setKe] = useState<string>("");
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState<{ ke?: string; alasan?: string }>({});
  const [kabar, setKabar] = useState("");

  const ubah = useMutation({
    mutationFn: (input: { status: ApplicationStatus; reason: string }) =>
      updateApplicationStatusAdmin(klien, lamaran.id, input),
    onSuccess: (terbaru) => {
      queryClient.setQueryData(applicationsKeys.adminDetail(lamaran.id), terbaru);
      // Daftar di belakang memuat status lama — semua saringannya dibuang.
      void queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      setKe("");
      setAlasan("");
      setKabar(
        t("admin.lamaran.ubah.berhasil", { status: t(KUNCI_STATUS_LAMARAN[terbaru.status]) }),
      );
    },
  });

  function kirim(e: FormEvent): void {
    e.preventDefault();
    if (ubah.isPending) return;
    const g = {
      ke: ke === "" ? t("admin.lamaran.ubah.galat.statusKosong") : undefined,
      alasan: periksaAlasan(alasan, t),
    };
    setGalat(g);
    setKabar("");
    if (g.ke !== undefined || g.alasan !== undefined) return;
    ubah.mutate({ status: ke as ApplicationStatus, reason: alasan.trim() });
  }

  return (
    <Kartu judul={t("admin.lamaran.ubah.judul")} tingkatJudul={3}>
      <p role="status" className="text-base font-medium text-green-900">
        {kabar}
      </p>
      {tujuan.length === 0 ? (
        <p className="text-base text-gray-900">{t("admin.lamaran.ubah.akhir")}</p>
      ) : (
        <form noValidate onSubmit={kirim} className="flex flex-col gap-4">
          <KolomForm label={t("admin.lamaran.ubah.statusBaru")} wajib galat={galat.ke}>
            <Pilihan
              opsi={tujuan.map((s) => ({ nilai: s, label: t(KUNCI_STATUS_LAMARAN[s]) }))}
              nilai={ke}
              placeholder={t("admin.lamaran.ubah.pilihStatus")}
              onUbah={setKe}
              bermasalah={galat.ke !== undefined}
            />
          </KolomForm>
          <KolomForm
            label={t("admin.lamaran.ubah.alasan")}
            bantuan={t("admin.lamaran.ubah.alasanBantuan")}
            wajib
            galat={galat.alasan}
          >
            <AreaTeks
              value={alasan}
              maxLength={200}
              rows={3}
              onChange={(e) => {
                setAlasan(e.target.value);
              }}
            />
          </KolomForm>
          {ubah.isError && (
            <p role="alert" className="text-base font-medium text-red-700">
              {pesanGalatLamaran(ubah.error, t)}
            </p>
          )}
          <Tombol
            type="submit"
            className="self-start"
            aria-disabled={ubah.isPending}
            aria-busy={ubah.isPending}
          >
            {ubah.isPending ? t("admin.lamaran.ubah.menyimpan") : t("admin.lamaran.ubah.simpan")}
          </Tombol>
        </form>
      )}
    </Kartu>
  );
}

function Pengungkapan({ klien, lamaran }: DetailLamaranProps) {
  const t = useTeks();
  const idJudulData = useId();
  const judulData = useRef<HTMLHeadingElement>(null);
  const [terbuka, setTerbuka] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState<string | undefined>(undefined);
  const [salinan, setSalinan] = useState<DisclosureSnapshot | null>(null);

  const buka = useMutation({
    mutationFn: (reason: string) => revealDisclosureAdmin(klien, lamaran.id, reason),
    onSuccess: (data) => {
      setSalinan(data);
      setTerbuka(false);
      setAlasan("");
      // Fokus ke judul data yang baru tampil: dialog menutup, dan tanpa ini
      // fokus kembali ke tombol yang sudah tidak ada.
      requestAnimationFrame(() => judulData.current?.focus());
    },
  });

  function kirim(): void {
    if (buka.isPending) return;
    const g = periksaAlasan(alasan, t, "admin.lamaran.ungkap.galat.alasanKosong");
    setGalat(g);
    if (g === undefined) buka.mutate(alasan.trim());
  }

  if (!lamaran.discloseDisability) {
    return (
      <Kartu judul={t("admin.lamaran.ungkap.judul")} tingkatJudul={3}>
        <p className="text-base text-gray-900">{t("admin.lamaran.ungkap.tidakDiungkap")}</p>
      </Kartu>
    );
  }

  const kosong = t("admin.lamaran.ungkap.kosong");

  return (
    <Kartu judul={t("admin.lamaran.ungkap.judul")} tingkatJudul={3}>
      <p role="status" className="sr-only">
        {salinan === null ? "" : t("admin.lamaran.ungkap.terbuka")}
      </p>
      {salinan === null ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-base text-gray-900">{t("admin.lamaran.ungkap.tersembunyi")}</p>
          <Dialog
            judul={t("admin.lamaran.ungkap.dialogJudul")}
            deskripsi={t("admin.lamaran.ungkap.dialogDeskripsi")}
            terbuka={terbuka}
            onUbahTerbuka={(b) => {
              setTerbuka(b);
              if (!b) setGalat(undefined);
            }}
            labelTutup={t("admin.lamaran.ungkap.batal")}
            pemicu={<Tombol varian="sekunder">{t("admin.lamaran.ungkap.tombol")}</Tombol>}
            aksi={
              <div className="flex flex-wrap gap-3">
                <Tombol aria-disabled={buka.isPending} aria-busy={buka.isPending} onClick={kirim}>
                  {buka.isPending
                    ? t("admin.lamaran.ungkap.membuka")
                    : t("admin.lamaran.ungkap.buka")}
                </Tombol>
                <Tombol
                  varian="sekunder"
                  onClick={() => {
                    setTerbuka(false);
                  }}
                >
                  {t("admin.lamaran.ungkap.batal")}
                </Tombol>
              </div>
            }
          >
            <KolomForm
              label={t("admin.lamaran.ungkap.alasan")}
              bantuan={t("admin.lamaran.ubah.alasanBantuan")}
              wajib
              galat={galat}
            >
              <AreaTeks
                value={alasan}
                maxLength={200}
                rows={3}
                onChange={(e) => {
                  setAlasan(e.target.value);
                }}
              />
            </KolomForm>
            {buka.isError && (
              <p role="alert" className="mt-2 text-base font-medium text-red-700">
                {pesanGalatLamaran(buka.error, t)}
              </p>
            )}
          </Dialog>
        </div>
      ) : (
        <section
          aria-labelledby={idJudulData}
          className="flex flex-col gap-3 text-base text-gray-900"
        >
          <h4 id={idJudulData} ref={judulData} tabIndex={-1} className="font-semibold">
            {t("admin.lamaran.ungkap.diambil", {
              tanggal: TANGGAL_LAMARAN.format(new Date(salinan.capturedAt)),
            })}
          </h4>
          <dl className="m-0 flex flex-col gap-2">
            <Baris
              label={t("admin.lamaran.ungkap.ragam")}
              isi={
                salinan.disabilityTypes.length === 0
                  ? kosong
                  : salinan.disabilityTypes
                      .map((r) => (KUNCI_RAGAM[r] ? t(KUNCI_RAGAM[r]) : r))
                      .join(", ")
              }
            />
            <Baris
              label={t("admin.lamaran.ungkap.akomodasi")}
              isi={
                salinan.accommodationNeeds.tags.length === 0
                  ? kosong
                  : salinan.accommodationNeeds.tags.map((a) => t(KUNCI_AKOMODASI[a])).join(", ")
              }
            />
            <Baris
              label={t("admin.lamaran.ungkap.catatan")}
              isi={salinan.accommodationNeeds.notes ?? kosong}
            />
          </dl>
          <Tombol
            varian="sekunder"
            className="self-start"
            onClick={() => {
              setSalinan(null);
            }}
          >
            {t("admin.lamaran.ungkap.sembunyikan")}
          </Tombol>
        </section>
      )}
    </Kartu>
  );
}
