// Panel preferensi aksesibilitas (PR-036) — isi permanen `/pengaturan/aksesibilitas`.
//
// RUMAH TETAP dari tujuh preferensi ADR-008. Wizard onboarding (PR-035) hanya
// menanyakannya SEKALI, saat pengguna paling sedikit tahu tentang aplikasi ini;
// panel inilah tempat ia mengubah pikirannya nanti — dan tempat preferensi yang
// gagal terkirim saat onboarding akhirnya bisa dikirim ulang.
//
// TIDAK TAHU APA PUN TENTANG ROUTER MAUPUN DOM, syarat lapisan `features/`
// (features/README.md): store dan klien diterima sebagai PROP, sama seperti
// `Wizard`. Komponen fitur yang memanggil `useA11yStoreWeb`/`useKlienApi`
// sendiri menjadi mustahil dipakai di luar tumpukan provider web.
//
// SIMPAN OTOMATIS PER FIELD, tanpa tombol "Simpan".
//
// Ini keputusan, bukan penyederhanaan. Tombol simpan melahirkan keadaan yang
// tidak bisa dibaca siapa pun: layar SUDAH berubah begitu sakelar ditekan
// (token `<html>` ditulis seketika — itulah seluruh guna store ini), jadi
// tombol yang belum ditekan berarti "yang Anda lihat bukan yang tersimpan"
// tanpa satu pun tanda di layar. Pengguna yang menutup tab pada saat itu
// kehilangan pilihannya justru karena ia sudah melihat pilihan itu berlaku.
//
// LABEL KETUJUH FIELD DIAMBIL DARI KATALOG ONBOARDING, bukan disalin ke katalog
// pengaturan. Keduanya menamai SAKELAR YANG SAMA; dua set kata untuk satu
// sakelar berarti pengguna yang tadi menyalakan "Kontras tinggi" di wizard
// tidak menemukan nama itu lagi di sini. Kuncinya tetap tinggal di tempat ia
// pertama ditulis — memindahkannya hanya menukar satu duplikasi dengan satu
// perubahan besar di berkas PR lain.
import { useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { dipilihPengguna, rekonsiliasi, type A11yStore, type SinyalOS } from "@nawasena/a11y";
import { updateAccessibility, type ApiClient } from "@nawasena/api-client";
import {
  ACCESSIBILITY_KEYS,
  type AccessibilityPreferences,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";
import { KolomForm, KotakCentang, Masukan, Tombol } from "@nawasena/ui";
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";

/** Keenam preferensi biner. `textScale` bukan sakelar dan punya kendalinya sendiri. */
const SAKLAR: readonly {
  kunci: Exclude<keyof AccessibilityPreferences, "textScale">;
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

/**
 * Satu kode yang perlu kalimat sendiri — alasannya sama dengan
 * `features/onboarding/pesan-galat.ts`: server sudah mengirim Bahasa Indonesia
 * untuk sisanya (`ERROR_CATALOG`, SDD §11), sedangkan `JARINGAN_GAGAL` lahir di
 * klien dan karena itu tidak punya kalimat server sama sekali.
 *
 * Kuncinya MILIK PANEL INI, bukan dipinjam dari onboarding: kalimat wizard
 * ditulis untuk layar yang sedang ditinggalkan pengguna, dan layar ini tidak ke
 * mana-mana — di sini "coba lagi" berarti menekan sakelarnya sekali lagi.
 */
const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "pengaturan.aksesibilitas.galat",
};

/**
 * Apa yang dikatakan PERANGKAT tentang satu preferensi — `undefined` bila ia
 * tidak mengatakan apa pun.
 *
 * Hanya dua dari tujuh preferensi punya sinyal sistem sama sekali
 * (`SinyalOS`), dan bedanya bukan gaya: `undefined` berarti "tidak diketahui",
 * yang BERBEDA dari `false` ("perangkat bilang tidak"). Peramban lama tidak
 * melaporkan `prefers-contrast`; memperlakukan ketiadaannya sebagai jawaban
 * membuat panel ini mengklaim mengikuti setelan yang tidak pernah bisa ia baca.
 *
 * Ditulis sebagai penyempitan eksplisit, bukan `os[kunci]` dengan cast: cast
 * akan tetap terkompilasi bila kelak sebuah kunci dihapus dari `SinyalOS`.
 */
function sinyalPerangkat(os: SinyalOS, kunci: keyof AccessibilityPreferences): boolean | undefined {
  if (kunci === "highContrast") return os.highContrast;
  if (kunci === "reduceMotion") return os.reduceMotion;
  return undefined;
}

export interface PanelAksesibilitasProps {
  /** Store preferensi yang SAMA dengan yang menggerakkan DOM (lihat `PenyediaA11y`). */
  store: A11yStore;
  klien: ApiClient;
}

export function PanelAksesibilitas({ store, klien }: PanelAksesibilitasProps) {
  const t = useTeks();

  // NILAI DIBACA DARI STORE, BUKAN DISALIN KE `useState` — alasan lengkapnya di
  // `features/onboarding/langkah-preferensi.tsx`. Ringkasnya: salinan lokal
  // menjadi sumber kebenaran KEDUA, dan ia menampilkan nilai lama begitu
  // preferensi berubah dari tempat lain — yang di halaman INI rutin terjadi,
  // sebab jawaban server bisa tiba kapan saja (`SambungkanServer`).
  const pilihanPengguna = store((s) => s.pilihanPengguna);
  const os = store((s) => s.os);
  const efektif = useMemo(() => rekonsiliasi(pilihanPengguna, os), [pilihanPengguna, os]);

  const simpan = useMutation({
    mutationFn: (perubahan: UpdateAccessibilityPreferences) =>
      updateAccessibility(klien, perubahan),
  });

  /**
   * Antrean pengiriman — DIURUTKAN, bukan di-debounce.
   *
   * Menekan reset berarti tujuh kunci berubah sekaligus, dan menekan beberapa
   * sakelar cepat-cepat berarti beberapa PUT beriringan. Tanpa urutan, jawaban
   * permintaan yang dikirim lebih dulu bisa tiba belakangan, dan yang tercatat
   * di akun menjadi nilai yang sudah ditinggalkan pengguna.
   *
   * Debounce menyelesaikan masalah yang sama tetapi merusak yang lain: ia
   * menunda "tersimpan" beberapa ratus milidetik sesudah sakelar ditekan,
   * sehingga pengumuman yang didengar pengguna screen reader tidak lagi
   * menempel pada perbuatannya.
   *
   * Kegagalan DITELAN di sini, bukan diabaikan: `useMutation` sudah mencatat
   * galatnya untuk ditampilkan, sementara promise tertolak yang menggantung di
   * rantai ini akan menjadi unhandled rejection.
   */
  const antrean = useRef<Promise<unknown>>(Promise.resolve());
  function kirim(perubahan: UpdateAccessibilityPreferences) {
    antrean.current = antrean.current.then(
      () => simpan.mutateAsync(perubahan).catch(() => undefined),
      () => undefined,
    );
  }

  /** Setel lokal LEBIH DULU (layar berubah seketika), lalu titipkan ke akun. */
  function ubah(perubahan: UpdateAccessibilityPreferences) {
    store.getState().setPreferensi(perubahan);
    kirim(perubahan);
  }

  /**
   * Kembali ke bawaan — dengan arti yang tepat: MENGHAPUS pilihan, bukan
   * menuliskan `ACCESSIBILITY_DEFAULTS`.
   *
   * Bedanya terlihat pada pengguna yang perangkatnya menyalakan kontras tinggi.
   * Menulis bawaan akan MEMATIKAN kontras itu dan memblokir sinyal OS-nya
   * selamanya (lihat `hapusPilihan` di store) — yaitu tombol "kembali ke
   * bawaan" yang justru membuang setelan perangkat pengguna. Menghapus
   * pilihannya mengembalikan urutan menang ADR-008 apa adanya: sinyal OS
   * muncul kembali.
   *
   * Yang DIKIRIM ke server kini `null` untuk ketujuh field — perintah hapus,
   * bukan nilai. Sebelum migrasi 09 kontraknya tidak punya cara menyatakan
   * "belum dipilih", jadi yang terkirim adalah `efektif()`: profil utuh berisi
   * nilai konkret. Akibatnya reset menghapus pilihan di perangkat ini tetapi
   * MENULISKANNYA sebagai pilihan baru di akun — sehingga perangkat lain, dan
   * perangkat ini sendiri sesudah masuk lagi, memakukan justru nilai yang baru
   * saja dilepas pengguna. Reset yang tidak mereset. Sekarang penghapusannya
   * berlaku di kedua tempat.
   */
  function reset() {
    for (const kunci of ACCESSIBILITY_KEYS) store.getState().hapusPilihan(kunci);
    kirim(Object.fromEntries(ACCESSIBILITY_KEYS.map((k) => [k, null])));
  }

  return (
    <div className="flex flex-col gap-5">
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
              ubah({ textScale: Number(e.target.value) });
            }}
          />
          {/* Nilainya juga TERLIHAT — penggeser tanpa nilai terbaca memaksa
              pengguna menebak dari lebar teks di layar.

              `shrink-0`: pada skala teks 200% kalimat "200 persen" lebih lebar
              daripada `min-w-16`, dan tanpa ini kotaknya diperas oleh penggeser
              di sebelahnya sampai isinya meluber keluar baris — halaman menuntut
              gulir mendatar (WCAG 1.4.10) tepat pada pengguna yang menyalakan
              pembesaran itu. Terukur, bukan diduga: `e2e/kontras-skala.spec.ts`. */}
          <output className="min-w-16 shrink-0 text-base font-semibold text-gray-900">
            {t("onboarding.preferensi.skalaNilai", { persen: efektif.textScale })}
          </output>
        </div>
      </KolomForm>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-base font-semibold text-gray-900">
          {t("onboarding.preferensi.legenda")}
        </legend>

        {SAKLAR.map(({ kunci, label, bantuan }) => {
          // KETERANGAN "mengikuti setelan perangkat" — tanpa ini, tombol reset
          // tampak rusak. Pengguna yang perangkatnya menyalakan kontras tinggi
          // menekan "kembali ke bawaan", lalu melihat sakelar itu TETAP menyala;
          // yang sebenarnya terjadi (pilihannya dihapus, sinyal perangkat muncul
          // kembali) tidak punya satu pun tanda di layar tanpa kalimat ini.
          const ikutPerangkat =
            !dipilihPengguna(pilihanPengguna, kunci) && sinyalPerangkat(os, kunci) !== undefined;

          return (
            <KotakCentang
              key={kunci}
              label={t(label)}
              bantuan={
                ikutPerangkat ? (
                  <>
                    {t(bantuan)} {t("pengaturan.aksesibilitas.ikutPerangkat")}
                  </>
                ) : (
                  t(bantuan)
                )
              }
              dicentang={efektif[kunci]}
              onUbah={(dicentang) => {
                ubah({ [kunci]: dicentang });
              }}
            />
          );
        })}
      </fieldset>

      {/*
        Selalu dirender, juga saat isinya kosong: live region yang lahir BERSAMA
        pesannya kerap tidak terbaca sama sekali (pola yang sama dengan
        `WilayahMemuat` PR-028b dan indikator progres wizard).

        `status` (polite), bukan `alert`: menyimpan adalah akibat yang DIMINTA
        pengguna, dan menyela pembacaan yang sedang berjalan demi mengabarkan
        keberhasilan justru mengusirnya dari kalimat yang sedang ia dengarkan.
      */}
      <p role="status" className="text-base text-gray-900">
        {simpan.isPending
          ? t("pengaturan.aksesibilitas.menyimpan")
          : simpan.isSuccess
            ? t("pengaturan.aksesibilitas.tersimpan")
            : ""}
      </p>

      {simpan.isError ? (
        // `role="alert"`: kegagalan ini tidak diminta siapa pun, jadi ia harus
        // TERDENGAR — bukan hanya terlihat. Pola yang sama dengan wizard.
        //
        // KALIMAT KEDUA yang paling penting. Pilihannya sudah berlaku di
        // perangkat ini dan TIDAK dibatalkan oleh kegagalan ini; sakelarnya
        // sengaja tidak dikembalikan — layar yang berubah sendiri karena
        // jaringan buruk jauh lebih membingungkan daripada satu nilai yang
        // belum tersalin ke akun.
        <div role="alert" className="flex flex-col gap-1">
          <p className="text-base font-semibold text-gray-900">
            {pesanGalatApi(simpan.error, t, PER_KODE)}
          </p>
          <p className="text-base text-gray-900">{t("pengaturan.aksesibilitas.tetapBerlaku")}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <Tombol varian="sekunder" onClick={reset}>
          {t("pengaturan.aksesibilitas.reset")}
        </Tombol>
        <p className="text-sm text-gray-700">{t("pengaturan.aksesibilitas.resetBantuan")}</p>
      </div>
    </div>
  );
}
