// Panel filter pencarian lowongan (PR-058) — AC "Cari + filter end-to-end",
// "Filter keyboard-only + tidak ada jebakan fokus".
//
// SATU FORM, SATU TOMBOL "Cari" — filter TIDAK diterapkan sambil mengetik
// atau sambil mencentang. Alasannya aksesibilitas, bukan sekadar mengurangi
// permintaan jaringan: hasil yang berubah sendiri di belakang pengguna yang
// masih menjelajahi kotak centang (khususnya screen reader, yang menavigasi
// linear) adalah perubahan konteks tak terduga (WCAG 3.2.2 "on input").
// Pengguna menekan SATU aksi eksplisit ("Cari") saat benar-benar siap.
//
// TIDAK ADA WIDGET YANG BISA MENJERAT FOKUS DI SINI — seluruhnya kontrol
// native (`<input>`, `<textarea>` tidak dipakai) atau Radix `Pilihan`/
// `KotakCentang` yang sudah teruji keyboard-only (PR-027/036). Tidak ada
// modal, popover custom, atau `tabIndex` manual.
import { ACCOMMODATION_NEEDS, type AccommodationNeed, type WorkMode } from "@nawasena/schemas";
import { KolomForm, KotakCentang, Masukan, Pilihan, Tombol } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";

/** Sama persis dengan `KUNCI_AKOMODASI` di `companies-formulir.tsx`/`akomodasi-daftar.tsx`. */
const KUNCI_AKOMODASI: Readonly<Record<AccommodationNeed, KunciTeks>> = {
  akses_kursi_roda: "profil.akomodasi.akses_kursi_roda",
  ramah_screen_reader: "profil.akomodasi.ramah_screen_reader",
  wawancara_via_teks: "profil.akomodasi.wawancara_via_teks",
  jam_kerja_fleksibel: "profil.akomodasi.jam_kerja_fleksibel",
  ruang_kerja_tenang: "profil.akomodasi.ruang_kerja_tenang",
  juru_bahasa_isyarat: "profil.akomodasi.juru_bahasa_isyarat",
};

/** Sentinel nilai Pilihan untuk "tanpa filter mode kerja" — Radix menolak nilai `""` pada Item. */
export const MODE_KERJA_SEMUA = "semua" as const;

/** Nilai form filter — SELALU string/array pilihan, pola sama formulir lain di repo ini. */
export interface NilaiFilterLowongan {
  query: string;
  city: string;
  province: string;
  workMode: WorkMode | typeof MODE_KERJA_SEMUA;
  accommodations: readonly AccommodationNeed[];
}

export const FILTER_KOSONG: NilaiFilterLowongan = {
  query: "",
  city: "",
  province: "",
  workMode: MODE_KERJA_SEMUA,
  accommodations: [],
};

export interface FilterPanelProps {
  nilai: NilaiFilterLowongan;
  onUbah: (nilai: NilaiFilterLowongan) => void;
  onCari: () => void;
  onReset: () => void;
}

export function FilterPanel({ nilai, onUbah, onCari, onReset }: FilterPanelProps) {
  const t = useTeks();

  return (
    <form
      aria-label={t("lowongan.filter.label")}
      // `noValidate`: pola sama seluruh form lain di repo ini (lihat
      // `companies-formulir.tsx`) — kolom di sini toh tidak ada yang wajib.
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onCari();
      }}
    >
      <KolomForm label={t("lowongan.filter.query")} bantuan={t("lowongan.filter.queryBantuan")}>
        <Masukan
          value={nilai.query}
          maxLength={200}
          onChange={(e) => {
            onUbah({ ...nilai, query: e.target.value });
          }}
        />
      </KolomForm>

      <div className="grid gap-4 sm:grid-cols-3">
        <KolomForm label={t("lowongan.filter.kota")}>
          <Masukan
            value={nilai.city}
            maxLength={100}
            onChange={(e) => {
              onUbah({ ...nilai, city: e.target.value });
            }}
          />
        </KolomForm>

        <KolomForm label={t("lowongan.filter.provinsi")}>
          <Masukan
            value={nilai.province}
            maxLength={100}
            onChange={(e) => {
              onUbah({ ...nilai, province: e.target.value });
            }}
          />
        </KolomForm>

        <KolomForm label={t("lowongan.filter.modeKerja")}>
          <Pilihan
            opsi={[
              { nilai: MODE_KERJA_SEMUA, label: t("lowongan.filter.modeKerjaSemua") },
              { nilai: "onsite", label: t("companies.lowongan.mode.onsite") },
              { nilai: "hybrid", label: t("companies.lowongan.mode.hybrid") },
              { nilai: "remote", label: t("companies.lowongan.mode.remote") },
            ]}
            nilai={nilai.workMode}
            onUbah={(dipilih) => {
              onUbah({ ...nilai, workMode: dipilih as NilaiFilterLowongan["workMode"] });
            }}
          />
        </KolomForm>
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-base font-semibold text-gray-900">
          {t("lowongan.filter.akomodasiLegenda")}
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
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Tombol type="submit">{t("lowongan.filter.cari")}</Tombol>
        <Tombol type="button" varian="sekunder" onClick={onReset}>
          {t("lowongan.filter.reset")}
        </Tombol>
      </div>
    </form>
  );
}
