// Langkah 3 — preferensi tampilan, dengan PRATINJAU LANGSUNG (PR-035).
//
// TIDAK ADA DRAF LOKAL, dan itu keseluruhan isi AC "setiap perubahan preferensi
// terlihat live sebelum simpan". Tiap kendali menulis LANGSUNG ke store
// `@nawasena/a11y` yang sama dengan yang menggerakkan `<html>` (PR-026b/c),
// sehingga layarnya berubah pada detik yang sama — bukan setelah tombol simpan
// ditekan, dan bukan setelah jawaban server tiba.
//
// Draf lokal yang "di-commit belakangan" akan tampak setara di layar tetapi
// TIDAK setara: ia menghasilkan wizard yang menjanjikan pratinjau sambil
// sebenarnya memperlihatkan tebakannya sendiri, dan perbedaannya baru terlihat
// ketika keduanya menyimpang.
//
// AKIBAT YANG DISENGAJA: menekan "Lewati" SESUDAH menyentuh kendali di sini
// tidak mengembalikan preferensinya. Itu benar — pengguna sudah melihat
// hasilnya dan memilih melanjutkan dengan tampilan itu; yang dilewati adalah
// PENYIMPANAN ke akun, bukan pilihannya sendiri. Jangan "perbaiki" menjadi
// pengembalian otomatis.
//
// KETUJUH FIELD DITAMPILKAN, bukan enam. SDD §4.3 menyebut enam; tabelnya (dan
// `packages/schemas/src/accessibility.ts`) punya tujuh — `screenReaderHint`
// yang tidak disebut SDD. Prisma sumber kebenaran skema (CLAUDE.md §12).
import { useMemo } from "react";
import { rekonsiliasi, type A11yStore } from "@nawasena/a11y";
import { KolomForm, Masukan } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { KotakCentang } from "./kotak-centang.js";

/**
 * Enam preferensi biner, sebagai data — urutan di layar mengikuti urutan di
 * sini. Yang ketujuh (`textScale`) bukan saklar dan punya kendalinya sendiri.
 */
const SAKLAR: readonly {
  kunci:
    | "highContrast"
    | "reduceMotion"
    | "simpleLanguage"
    | "largeTouchTargets"
    | "prefersSignLanguage"
    | "screenReaderHint";
  label: KunciTeks;
  bantuan: KunciTeks;
}[] = [
  {
    kunci: "highContrast",
    label: "onboarding.preferensi.kontras",
    bantuan: "onboarding.preferensi.kontrasBantuan",
  },
  {
    kunci: "reduceMotion",
    label: "onboarding.preferensi.gerak",
    bantuan: "onboarding.preferensi.gerakBantuan",
  },
  {
    kunci: "simpleLanguage",
    label: "onboarding.preferensi.bahasa",
    bantuan: "onboarding.preferensi.bahasaBantuan",
  },
  {
    kunci: "largeTouchTargets",
    label: "onboarding.preferensi.sentuh",
    bantuan: "onboarding.preferensi.sentuhBantuan",
  },
  {
    kunci: "prefersSignLanguage",
    label: "onboarding.preferensi.bisindo",
    bantuan: "onboarding.preferensi.bisindoBantuan",
  },
  {
    kunci: "screenReaderHint",
    label: "onboarding.preferensi.pembacaLayar",
    bantuan: "onboarding.preferensi.pembacaLayarBantuan",
  },
];

export interface LangkahPreferensiProps {
  store: A11yStore;
}

export function LangkahPreferensi({ store }: LangkahPreferensiProps) {
  const t = useTeks();

  // NILAI DIBACA DARI STORE, BUKAN DISALIN KE `useState`.
  //
  // Salinan lokal akan menjadi sumber kebenaran KEDUA: begitu preferensi
  // berubah dari tempat lain (sinyal OS berubah di tengah wizard, misalnya),
  // kendali di layar ini menampilkan nilai lama sementara halamannya sudah
  // memakai yang baru.
  //
  // `efektif()` merakit objek BARU tiap panggilan, jadi ia tidak boleh menjadi
  // nilai langganan langsung — React akan menganggap setiap render sebagai
  // perubahan. Yang dilanggan adalah dua bagian state yang identitasnya stabil,
  // dan `rekonsiliasi` (fungsi yang SAMA dengan yang dipakai `efektif()`)
  // merakitnya dari keduanya.
  const pilihanPengguna = store((s) => s.pilihanPengguna);
  const os = store((s) => s.os);
  const efektif = useMemo(() => rekonsiliasi(pilihanPengguna, os), [pilihanPengguna, os]);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-base text-gray-900">{t("onboarding.preferensi.penjelasan")}</p>

      <KolomForm
        label={t("onboarding.preferensi.skalaTeks")}
        bantuan={t("onboarding.preferensi.skalaBantuan")}
      >
        <div className="flex items-center gap-3">
          <Masukan
            type="range"
            min={100}
            max={200}
            step={25}
            value={efektif.textScale}
            // Diumumkan sebagai persen, bukan angka telanjang: "150" tanpa
            // satuan tidak berarti apa pun saat dibacakan.
            aria-valuetext={t("onboarding.preferensi.skalaNilai", { persen: efektif.textScale })}
            onChange={(e) => {
              store.getState().setPreferensi({ textScale: Number(e.target.value) });
            }}
          />
          {/* Nilainya juga TERLIHAT. Slider tanpa nilai terbaca memaksa
              pengguna menebak dari lebar teks di layar. */}
          <output className="min-w-16 text-base font-semibold text-gray-900">
            {t("onboarding.preferensi.skalaNilai", { persen: efektif.textScale })}
          </output>
        </div>
      </KolomForm>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-base font-semibold text-gray-900">
          {t("onboarding.preferensi.legenda")}
        </legend>

        {SAKLAR.map(({ kunci, label, bantuan }) => (
          <KotakCentang
            key={kunci}
            label={t(label)}
            bantuan={t(bantuan)}
            dicentang={efektif[kunci]}
            onUbah={(dicentang) => {
              // SINKRON, pada tiap perubahan. Inilah pratinjaunya.
              store.getState().setPreferensi({ [kunci]: dicentang });
            }}
          />
        ))}
      </fieldset>
    </div>
  );
}
