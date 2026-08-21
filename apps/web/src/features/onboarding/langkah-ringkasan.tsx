// Langkah 4 — ringkasan sebelum disimpan (PR-035).
//
// HANYA MEMBACA. Tidak ada kendali yang mengubah apa pun di sini; yang ingin
// mengubah menekan "Kembali". Layar ringkasan yang juga bisa menyunting akan
// melahirkan dua tempat untuk mengubah preferensi yang sama, dan yang kedua
// selalu menjadi yang lupa disesuaikan.
//
// PILIHAN RAGAM DISABILITAS DITAMPILKAN LAGI DI SINI, dan itu bukan
// pengiriman: nilainya datang dari state React milik `Wizard` dan berhenti di
// layar. Ia ditampilkan justru supaya pengguna melihat apa yang ia jawab tadi —
// dan supaya kalimat "belum dikirim ke mana pun" berdiri tepat di sebelah
// datanya, bukan di layar yang sudah ia tinggalkan.
import type { ReactNode } from "react";
import type { A11yStore } from "@nawasena/a11y";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { RAGAM } from "./langkah-ragam-disabilitas.js";

/** Satu baris ringkasan sebagai pasangan `<dt>`/`<dd>` — sama seperti panel akun. */
function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    // `<dt>`/`<dd>` sebagai anak LANGSUNG `<dl>`, tanpa `<div>` pembungkus:
    // pembungkus itu sah menurut HTML tetapi melunturkan peran `term`/
    // `definition` pada sebagian mesin pembaca peran (lihat `pengaturan-akun.tsx`).
    <>
      <dt className="pt-2 text-sm font-semibold text-gray-700">{label}</dt>
      <dd className="border-b border-gray-200 pb-2 text-base text-gray-900">{nilai}</dd>
    </>
  );
}

const SAKLAR: readonly {
  kunci:
    | "highContrast"
    | "reduceMotion"
    | "simpleLanguage"
    | "largeTouchTargets"
    | "prefersSignLanguage"
    | "screenReaderHint";
  label: KunciTeks;
}[] = [
  { kunci: "highContrast", label: "onboarding.preferensi.kontras" },
  { kunci: "reduceMotion", label: "onboarding.preferensi.gerak" },
  { kunci: "simpleLanguage", label: "onboarding.preferensi.bahasa" },
  { kunci: "largeTouchTargets", label: "onboarding.preferensi.sentuh" },
  { kunci: "prefersSignLanguage", label: "onboarding.preferensi.bisindo" },
  { kunci: "screenReaderHint", label: "onboarding.preferensi.pembacaLayar" },
];

export interface LangkahRingkasanProps {
  store: A11yStore;
  ragam: readonly string[];
  setuju: boolean;
  /**
   * Tautan ke halaman profil karier (PR-040) — DITERIMA JADI, bukan dirakit
   * di sini.
   *
   * `features/` tidak boleh bergantung pada router web (features/README.md):
   * ia dipakai ulang mobile, yang tidak punya `<Link>`. Perpindahan halaman
   * karena itu selalu datang dari pemanggil — pola yang sama dengan `onKeluar`
   * pada `Wizard`. Diterima sebagai NODE, bukan callback, supaya yang dirender
   * tetap sebuah tautan sungguhan: tombol yang memanggil `navigate()` tidak
   * bisa dibuka di tab baru, tidak menampilkan alamat tujuan di bilah status,
   * dan tidak dikenali sebagai tautan oleh screen reader.
   */
  tautanProfil?: ReactNode;
}

export function LangkahRingkasan({
  store,
  ragam,
  setuju,
  tautanProfil,
}: LangkahRingkasanProps) {
  const t = useTeks();
  const efektif = store.getState().efektif();

  const namaRagam = RAGAM.filter((r) => ragam.includes(r.nilai)).map((r) => t(r.kunci));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-base text-gray-900">{t("onboarding.ringkasan.penjelasan")}</p>

      <section aria-labelledby="ringkasan-preferensi" className="flex flex-col gap-2">
        <h3 id="ringkasan-preferensi" className="text-lg font-semibold text-gray-900">
          {t("onboarding.ringkasan.preferensi")}
        </h3>
        <dl className="flex flex-col gap-0">
          <Baris
            label={t("onboarding.preferensi.skalaTeks")}
            nilai={t("onboarding.preferensi.skalaNilai", { persen: efektif.textScale })}
          />
          {SAKLAR.map(({ kunci, label }) => (
            <Baris
              key={kunci}
              label={t(label)}
              // "Aktif"/"Tidak aktif" DITULIS, bukan ditandai centang/silang:
              // ikon tanpa teks tidak punya nama yang bisa dibacakan, dan
              // warna sendirian melanggar WCAG 1.4.1.
              nilai={
                efektif[kunci]
                  ? t("onboarding.ringkasan.aktif")
                  : t("onboarding.ringkasan.nonaktif")
              }
            />
          ))}
        </dl>
      </section>

      <section aria-labelledby="ringkasan-ragam" className="flex flex-col gap-2">
        <h3 id="ringkasan-ragam" className="text-lg font-semibold text-gray-900">
          {t("onboarding.ringkasan.ragam")}
        </h3>
        <p className="text-base text-gray-900">
          {namaRagam.length === 0 ? t("onboarding.ringkasan.ragamKosong") : namaRagam.join(", ")}
        </p>
        <p className="text-base text-gray-900">
          {setuju ? t("onboarding.ringkasan.setuju") : t("onboarding.ringkasan.tidakSetuju")}
        </p>
        {/*
          Diulang di sini, bukan diandalkan pada ingatan dari langkah 1: antara
          menjawab dan sampai di layar ini pengguna sudah menyeberangi dua
          langkah lain, dan inilah layar terakhir sebelum ia menekan simpan.
        */}
        <p className="text-base font-semibold text-gray-900">
          {t("onboarding.ringkasan.tidakDikirim")}
        </p>

        {/*
          JALAN KELUAR bagi yang memang ingin menyimpannya (PR-040).

          Kalimat di atas menyatakan datanya TIDAK dikirim ke mana pun, dan itu
          tetap benar: wizard ini tidak pernah mengirimnya. Tetapi pernyataan
          itu sendirian meninggalkan pengguna yang justru INGIN kebutuhan
          akomodasinya diketahui tanpa satu pun petunjuk ke mana harus pergi —
          dan yang paling dirugikan adalah orang yang paling membutuhkan
          akomodasi itu.

          Tautan, bukan pengiriman diam-diam: consent yang sesungguhnya diminta
          di halaman tujuan, di layar yang sekaligus menawarkan pencabutannya.
        */}
        {tautanProfil}
      </section>
    </div>
  );
}
