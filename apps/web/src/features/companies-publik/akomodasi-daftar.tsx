// Daftar akomodasi — halaman publik perusahaan (PR-054, Gap G5).
//
// AC PR-054: "Semua ikon akomodasi berlabel teks". Ikonnya di sini SATU
// bentuk saja (tanda centang), dekoratif dan `aria-hidden`, dipasangkan
// dengan LABEL TEKS PENUH di sampingnya — bukan ikon berbeda per jenis
// akomodasi yang hanya bisa dibedakan lewat `title`/tooltip. Screen reader
// yang menjelajah daftar ini mendengar label akomodasinya, bukan "gambar".
//
// LABEL DIPINJAM dari katalog `profil` (`profil.akomodasi.*`) — alasan sama
// dengan `companies-formulir.tsx` admin: satu taksonomi, satu salinan teks.
import type { AccommodationNeed } from "@nawasena/schemas";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";

const KUNCI_AKOMODASI: Readonly<Record<AccommodationNeed, KunciTeks>> = {
  akses_kursi_roda: "profil.akomodasi.akses_kursi_roda",
  ramah_screen_reader: "profil.akomodasi.ramah_screen_reader",
  wawancara_via_teks: "profil.akomodasi.wawancara_via_teks",
  jam_kerja_fleksibel: "profil.akomodasi.jam_kerja_fleksibel",
  ruang_kerja_tenang: "profil.akomodasi.ruang_kerja_tenang",
  juru_bahasa_isyarat: "profil.akomodasi.juru_bahasa_isyarat",
};

/** Tanda centang dekoratif — bentuknya sama untuk seluruh akomodasi (lihat catatan atas). */
function IkonCentang() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      className="mt-0.5 h-5 w-5 shrink-0 text-green-700"
    >
      <path
        fill="currentColor"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
      />
    </svg>
  );
}

export interface DaftarAkomodasiProps {
  akomodasi: readonly AccommodationNeed[];
}

export function DaftarAkomodasi({ akomodasi }: DaftarAkomodasiProps) {
  const t = useTeks();

  if (akomodasi.length === 0) {
    return <p className="text-base text-gray-900">{t("companies.akomodasi.kosong")}</p>;
  }

  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {akomodasi.map((a) => (
        <li key={a} className="flex items-start gap-2 text-base text-gray-900">
          <IkonCentang />
          <span>{t(KUNCI_AKOMODASI[a])}</span>
        </li>
      ))}
    </ul>
  );
}
