// Langkah 1 — ragam disabilitas (PR-035). Opsional, bisa dilewati, dan
// JAWABANNYA TIDAK PERNAH MENINGGALKAN PERANGKAT INI.
//
// KALIMAT TERAKHIR ITU BUKAN JANJI PEMASARAN, MELAINKAN KEADAAN NYATA REPO INI.
// Endpoint penyimpanan data disabilitas (PR-037) belum ada — tidak ada modul,
// tidak ada tabel, tidak ada rute. Jadi pilihan di layar ini hidup di state
// React milik `Wizard`, dipakai untuk mengisi ringkasan di langkah terakhir,
// lalu hilang bersama komponennya. Tidak ada penulisan ke `@nawasena/a11y`,
// tidak ada ke `localStorage`, tidak ada permintaan jaringan — pada jalur mana
// pun, dengan atau tanpa persetujuan. Dijaga test (`onboarding.test.tsx`).
//
// Bila PR-037 kelak lahir, yang berubah adalah `Wizard`, bukan berkas ini:
// komponen ini hanya melaporkan pilihan ke atas lewat `onUbah`.
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { KotakCentang } from "./kotak-centang.js";

/**
 * Ragam yang ditawarkan, sebagai DATA.
 *
 * Nilainya (`tuli`, `netra`, …) sengaja stabil dan bukan teks tampilan: teks
 * berubah mengikuti mode bahasa, dan nilai yang ikut berubah akan membuat
 * pilihan pengguna tampak hilang begitu ia menyalakan mode sederhana.
 *
 * "Lainnya" ada karena daftar tertutup selalu meninggalkan seseorang di luar —
 * dan orang itu, di layar tentang disabilitas, adalah orang yang paling tidak
 * boleh kita suruh memilih kotak yang salah tentang dirinya.
 */
export const RAGAM: readonly { nilai: string; kunci: KunciTeks }[] = [
  { nilai: "tuli", kunci: "onboarding.ragam.tuli" },
  { nilai: "netra", kunci: "onboarding.ragam.netra" },
  { nilai: "daksa", kunci: "onboarding.ragam.daksa" },
  { nilai: "autisme", kunci: "onboarding.ragam.autisme" },
  { nilai: "lainnya", kunci: "onboarding.ragam.lainnya" },
];

export interface LangkahRagamDisabilitasProps {
  terpilih: readonly string[];
  onUbah: (terpilih: readonly string[]) => void;
}

export function LangkahRagamDisabilitas({ terpilih, onUbah }: LangkahRagamDisabilitasProps) {
  const t = useTeks();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-gray-900">{t("onboarding.ragam.penjelasan")}</p>
      {/*
        Disebut LEBIH DULU, sebelum satu kotak pun ditawarkan: pengguna berhak
        tahu ke mana jawabannya pergi SEBELUM ia menjawab, bukan sesudah.
      */}
      <p className="text-base font-semibold text-gray-900">{t("onboarding.ragam.tidakDikirim")}</p>

      {/*
        `<fieldset>` + `<legend>`: sekumpulan kotak centang yang menjawab SATU
        pertanyaan harus punya nama bersama. Tanpa itu, screen reader
        membacakan lima kotak lepas tanpa pernah menyebutkan pertanyaannya.
      */}
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-base font-semibold text-gray-900">
          {t("onboarding.ragam.legenda")}
        </legend>

        {RAGAM.map(({ nilai, kunci }) => (
          <KotakCentang
            key={nilai}
            label={t(kunci)}
            dicentang={terpilih.includes(nilai)}
            onUbah={(dicentang) => {
              onUbah(
                dicentang
                  ? [...terpilih, nilai]
                  : terpilih.filter((sebelumnya) => sebelumnya !== nilai),
              );
            }}
          />
        ))}
      </fieldset>

      <p className="text-sm text-gray-700">{t("onboarding.ragam.opsional")}</p>
    </div>
  );
}
