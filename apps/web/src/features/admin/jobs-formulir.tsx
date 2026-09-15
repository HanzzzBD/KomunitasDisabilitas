// Formulir tambah/ubah lowongan — AC PR-057: "Validasi akomodasi wajib
// sebelum publish (server+client)" (bagian client — lihat `KolomForm` di
// bawah; validasi SEBELUM terbitkan sendiri ada di `admin-jobs-formulir.tsx`,
// route yang memegang tombol Terbitkan), "Form panjang tetap keyboard-only
// nyaman (section)".
//
// TAKSONOMI AKOMODASI DAN RAGAM DISABILITAS TIDAK PERNAH BISA MEMUAT NILAI
// LIAR SECARA STRUKTURAL — pola sama `companies-formulir.tsx`: kotak
// centangnya dirakit dari `ACCOMMODATION_NEEDS`/`DISABILITY_TYPES` (satu-
// satunya sumber taksonomi), bukan dari teks bebas.
//
// LABEL AKOMODASI DIPINJAM dari katalog `profil`, LABEL RAGAM DISABILITAS
// DIPINJAM dari katalog `onboarding` (lewat `RAGAM`, `langkah-ragam-
// disabilitas.tsx`) — TIDAK ditulis ulang. Admin dan pencari kerja harus
// membaca nama yang SAMA PERSIS untuk taksonomi yang sama; alasan yang sama
// dengan `companies-formulir.tsx`.
//
// "SECTION" DI SINI ADALAH `<h3>` + PENGELOMPOKAN VISUAL, BUKAN WIDGET BARU.
// AC "Form panjang tetap keyboard-only nyaman (section)" terpenuhi lewat
// struktur heading yang bisa dilompati (Tab tetap berjalan linear seperti
// biasa; heading membantu navigasi NON-linear screen reader/orientasi
// visual) — bukan mengubah urutan fokus atau menambah widget kolaps yang
// justru menambah kompleksitas keyboard.
import { ACCOMMODATION_NEEDS, DISABILITY_TYPES, type AccommodationNeed } from "@nawasena/schemas";
import { AreaTeks, KolomForm, KotakCentang, Masukan, Pilihan, Tombol } from "@nawasena/ui";
import { RAGAM } from "../onboarding/langkah-ragam-disabilitas.js";
import { useTeks, type FungsiTeks, type KunciTeks } from "../../shared/i18n/index.js";
import type { NilaiLowongan } from "./jobs-badan.js";
import type { GalatKolom } from "./jobs-pesan-galat.js";

/** Sama persis dengan `KUNCI_AKOMODASI` di `companies-formulir.tsx`. */
const KUNCI_AKOMODASI: Readonly<Record<AccommodationNeed, KunciTeks>> = {
  akses_kursi_roda: "profil.akomodasi.akses_kursi_roda",
  ramah_screen_reader: "profil.akomodasi.ramah_screen_reader",
  wawancara_via_teks: "profil.akomodasi.wawancara_via_teks",
  jam_kerja_fleksibel: "profil.akomodasi.jam_kerja_fleksibel",
  ruang_kerja_tenang: "profil.akomodasi.ruang_kerja_tenang",
  juru_bahasa_isyarat: "profil.akomodasi.juru_bahasa_isyarat",
};

/** Sama persis dengan `KUNCI_RAGAM` di `features/profil/bagian-sensitif.tsx`. */
const KUNCI_RAGAM: Readonly<Record<string, KunciTeks>> = Object.fromEntries(
  RAGAM.map((r) => [r.nilai, r.kunci]),
);

function opsiJenisPekerjaan(t: FungsiTeks) {
  return [
    { nilai: "full_time", label: t("admin.jobs.form.jenisPekerjaan.fullTime") },
    { nilai: "part_time", label: t("admin.jobs.form.jenisPekerjaan.partTime") },
    { nilai: "contract", label: t("admin.jobs.form.jenisPekerjaan.contract") },
    { nilai: "internship", label: t("admin.jobs.form.jenisPekerjaan.internship") },
    { nilai: "freelance", label: t("admin.jobs.form.jenisPekerjaan.freelance") },
  ];
}

function opsiModeKerja(t: FungsiTeks) {
  return [
    { nilai: "onsite", label: t("admin.jobs.form.modeKerja.onsite") },
    { nilai: "hybrid", label: t("admin.jobs.form.modeKerja.hybrid") },
    { nilai: "remote", label: t("admin.jobs.form.modeKerja.remote") },
  ];
}

export interface OpsiPerusahaan {
  id: string;
  name: string;
}

export interface FormulirLowonganProps {
  mode: "buat" | "ubah";
  nilai: NilaiLowongan;
  onUbah: (nilai: NilaiLowongan) => void;
  galat: GalatKolom;
  sedangMenyimpan: boolean;
  onSimpan: () => void;
  onBatal: () => void;
  /** Id untuk `aria-labelledby` — form ini dipasang di bawah `<h1>` halaman. */
  namaForm: string;
  /** Daftar perusahaan untuk pemilih — dari `listCompaniesAdmin` (sudah/akan di-cache). */
  perusahaanOpsi: readonly OpsiPerusahaan[];
}

export function FormulirLowongan({
  mode,
  nilai,
  onUbah,
  galat,
  sedangMenyimpan,
  onSimpan,
  onBatal,
  namaForm,
  perusahaanOpsi,
}: FormulirLowonganProps) {
  const t = useTeks();

  return (
    <form
      aria-label={namaForm}
      // `noValidate` — pola sama `companies-formulir.tsx`, alasan yang sama:
      // validasi bawaan peramban memblokir submit tanpa Bahasa Indonesia dan
      // tanpa tersambung ke `aria-describedby`.
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (sedangMenyimpan) return;
        onSimpan();
      }}
    >
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-gray-900">{t("admin.jobs.form.bagianDasar")}</h3>

        <KolomForm
          label={t("admin.jobs.form.perusahaan")}
          wajib
          galat={galat.companyId}
          bantuan={mode === "ubah" ? t("admin.jobs.form.perusahaanTakBisaDiubah") : undefined}
        >
          <Pilihan
            opsi={perusahaanOpsi.map((p) => ({ nilai: p.id, label: p.name }))}
            nilai={nilai.companyId}
            nonaktif={mode === "ubah"}
            placeholder={t("admin.jobs.form.perusahaanPlaceholder")}
            onUbah={(dipilih) => {
              onUbah({ ...nilai, companyId: dipilih });
            }}
          />
        </KolomForm>

        <KolomForm label={t("admin.jobs.form.judul")} wajib galat={galat.title}>
          <Masukan
            value={nilai.title}
            maxLength={200}
            onChange={(e) => {
              onUbah({ ...nilai, title: e.target.value });
            }}
          />
        </KolomForm>

        <KolomForm label={t("admin.jobs.form.deskripsi")} wajib galat={galat.description}>
          <AreaTeks
            value={nilai.description}
            rows={5}
            maxLength={5000}
            onChange={(e) => {
              onUbah({ ...nilai, description: e.target.value });
            }}
          />
        </KolomForm>

        <KolomForm
          label={t("admin.jobs.form.persyaratan")}
          bantuan={t("admin.jobs.form.persyaratanBantuan")}
          galat={galat.requirements}
        >
          <AreaTeks
            value={nilai.requirements}
            rows={4}
            maxLength={3000}
            onChange={(e) => {
              onUbah({ ...nilai, requirements: e.target.value });
            }}
          />
        </KolomForm>

        <KolomForm
          label={t("admin.jobs.form.jenisPekerjaanLabel")}
          wajib
          galat={galat.employmentType}
        >
          <Pilihan
            opsi={opsiJenisPekerjaan(t)}
            nilai={nilai.employmentType}
            onUbah={(dipilih) => {
              onUbah({ ...nilai, employmentType: dipilih as NilaiLowongan["employmentType"] });
            }}
          />
        </KolomForm>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-gray-900">{t("admin.jobs.form.bagianLokasi")}</h3>

        <KolomForm label={t("admin.jobs.form.modeKerjaLabel")} wajib galat={galat.workMode}>
          <Pilihan
            opsi={opsiModeKerja(t)}
            nilai={nilai.workMode}
            onUbah={(dipilih) => {
              onUbah({ ...nilai, workMode: dipilih as NilaiLowongan["workMode"] });
            }}
          />
        </KolomForm>

        <div className="grid gap-4 sm:grid-cols-2">
          <KolomForm label={t("admin.jobs.form.kota")} galat={galat.city}>
            <Masukan
              value={nilai.city}
              maxLength={100}
              onChange={(e) => {
                onUbah({ ...nilai, city: e.target.value });
              }}
            />
          </KolomForm>

          <KolomForm label={t("admin.jobs.form.provinsi")} galat={galat.province}>
            <Masukan
              value={nilai.province}
              maxLength={100}
              onChange={(e) => {
                onUbah({ ...nilai, province: e.target.value });
              }}
            />
          </KolomForm>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-gray-900">{t("admin.jobs.form.bagianGaji")}</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <KolomForm label={t("admin.jobs.form.gajiMin")} galat={galat.salaryMin}>
            <Masukan
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={nilai.salaryMin}
              onChange={(e) => {
                onUbah({ ...nilai, salaryMin: e.target.value });
              }}
            />
          </KolomForm>

          <KolomForm label={t("admin.jobs.form.gajiMax")} galat={galat.salaryMax}>
            <Masukan
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={nilai.salaryMax}
              onChange={(e) => {
                onUbah({ ...nilai, salaryMax: e.target.value });
              }}
            />
          </KolomForm>
        </div>

        <KotakCentang
          label={t("admin.jobs.form.gajiTampil")}
          bantuan={t("admin.jobs.form.gajiTampilBantuan")}
          dicentang={nilai.salaryVisible}
          onUbah={(dicentang) => {
            onUbah({ ...nilai, salaryVisible: dicentang });
          }}
        />
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-lg font-semibold text-gray-900">
          {t("admin.jobs.form.akomodasiLegenda")}
        </legend>
        {ACCOMMODATION_NEEDS.map((akomodasi) => (
          <KotakCentang
            key={akomodasi}
            label={t(KUNCI_AKOMODASI[akomodasi])}
            dicentang={nilai.accommodations.includes(akomodasi)}
            onUbah={(dicentang) => {
              onUbah({
                ...nilai,
                accommodations: dicentang
                  ? [...nilai.accommodations, akomodasi]
                  : nilai.accommodations.filter((a) => a !== akomodasi),
              });
            }}
          />
        ))}
        {galat.accommodations !== undefined && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {galat.accommodations}
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-lg font-semibold text-gray-900">
          {t("admin.jobs.form.ragamLegenda")}
        </legend>
        {DISABILITY_TYPES.map((ragam) => (
          <KotakCentang
            key={ragam}
            label={t(KUNCI_RAGAM[ragam] ?? "admin.jobs.form.ragamLegenda")}
            dicentang={nilai.welcomedDisabilityTypes.includes(ragam)}
            onUbah={(dicentang) => {
              onUbah({
                ...nilai,
                welcomedDisabilityTypes: dicentang
                  ? [...nilai.welcomedDisabilityTypes, ragam]
                  : nilai.welcomedDisabilityTypes.filter((r) => r !== ragam),
              });
            }}
          />
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Tombol type="submit" aria-disabled={sedangMenyimpan} aria-busy={sedangMenyimpan}>
          {sedangMenyimpan ? t("admin.jobs.form.menyimpan") : t("admin.jobs.form.simpan")}
        </Tombol>
        <Tombol type="button" varian="sekunder" onClick={onBatal}>
          {t("admin.jobs.form.batal")}
        </Tombol>
      </div>
    </form>
  );
}
