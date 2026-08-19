// Wizard onboarding aksesibilitas (PR-035) — kerangka empat langkah.
//
// TIDAK TAHU APA PUN TENTANG ROUTER, dan itu syarat lapisan ini: `features/`
// dipakai ulang mobile (features/README.md), jadi perpindahan halaman
// diserahkan kepada pemanggil lewat `onKeluar`. Pola yang sama dipakai
// `DialogHapusAkun` (PR-033c-1) untuk alasan yang sama persis.
//
// STORE DAN KLIEN DITERIMA SEBAGAI PROP, bukan diambil dari hook aplikasi.
// Sekali lagi alasan lapisan: `useA11yStoreWeb`/`useKlienApi` tinggal di
// `app/`, dan komponen fitur yang memanggilnya menjadi mustahil dipakai di luar
// tumpukan provider web.
//
// KENAPA `useReducer`, BUKAN Zustand. Keadaan ini hidup dan mati bersama satu
// route: ia dibaca hanya oleh wizard dan anak-anaknya, dan ia TIDAK BOLEH
// selamat dari muat ulang — wizard yang ditinggalkan di tengah tidak seharusnya
// melanjutkan dari langkah tiga besok pagi. Zustand di repo ini disediakan
// untuk keadaan yang menyeberangi route (preferensi, sesi); memakainya di sini
// akan menjadi contoh pertama yang bertentangan dengan itu.
import { useEffect, useReducer, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { updateAccessibility, type ApiClient } from "@nawasena/api-client";
import type { A11yStore } from "@nawasena/a11y";
import { Tombol } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import {
  LANGKAH,
  initStateWizard,
  langkahSaatIni,
  reduksiWizard,
  type Langkah,
} from "./mesin-langkah.js";
import { idPenggunaSaatIni, tandaiOnboardingSelesai } from "./identitas.js";
import { LangkahRagamDisabilitas } from "./langkah-ragam-disabilitas.js";
import { LangkahPersetujuan } from "./langkah-persetujuan.js";
import { LangkahPreferensi } from "./langkah-preferensi.js";
import { LangkahRingkasan } from "./langkah-ringkasan.js";
import { pesanGalatSimpan } from "./pesan-galat.js";

/** Judul tiap langkah, sebagai data — dipakai indikator progres DAN judul seksi. */
const JUDUL: Readonly<Record<Langkah, KunciTeks>> = {
  ragam: "onboarding.langkah.ragam",
  persetujuan: "onboarding.langkah.persetujuan",
  preferensi: "onboarding.langkah.preferensi",
  ringkasan: "onboarding.langkah.ringkasan",
};

export interface WizardProps {
  /** Store preferensi yang SAMA dengan yang menggerakkan DOM (lihat `PenyediaA11y`). */
  store: A11yStore;
  klien: ApiClient;
  /** Dipanggil setelah penanda selesai ditulis — pemanggil yang memindahkan halaman. */
  onKeluar: () => void;
}

export function Wizard({ store, klien, onKeluar }: WizardProps) {
  const t = useTeks();
  const [state, kirim] = useReducer(reduksiWizard, undefined, initStateWizard);

  // PILIHAN RAGAM DISABILITAS DAN PERSETUJUAN HIDUP DI SINI, DI MEMORI, TITIK.
  //
  // Tidak ditulis ke `@nawasena/a11y`, tidak ke `localStorage`, tidak dikirim
  // ke mana pun — endpoint penyimpanannya (PR-037) belum ada, dan memanggil
  // yang belum ada bukan "persiapan" melainkan cacat. Keduanya hilang begitu
  // komponen ini dilepas, lewat jalur keluar apa pun. Dijaga test.
  const [ragam, setRagam] = useState<readonly string[]>([]);
  const [setuju, setSetuju] = useState(false);

  const langkah = langkahSaatIni(state);
  const nomor = state.indeks + 1;

  const judulRef = useRef<HTMLHeadingElement>(null);
  const langkahSebelumnya = useRef<Langkah | null>(null);
  // Fokus dipindahkan ke judul langkah baru, BUKAN dibiarkan di tombol "Lanjut"
  // yang barusan ditekan. Tanpa ini, pengguna keyboard menekan Lanjut lalu
  // Tab berikutnya melanjutkan dari kendali di BAWAH isi langkah baru — ia
  // melewati seluruh isinya tanpa pernah tahu isi itu ada.
  //
  // HANYA SAAT LANGKAHNYA BERGANTI, TIDAK SAAT DIPASANG PERTAMA KALI, dan itu
  // bukan penghematan melainkan perbaikan cacat: memindahkan fokus pada
  // pemasangan berarti pengguna yang baru membuka halaman ini sudah berada di
  // TENGAH dokumen, sehingga tekanan Tab pertamanya melewati tautan "Lompat ke
  // konten" — satu-satunya alasan tautan itu ada. Terbukti, bukan diduga:
  // `e2e/lompat-ke-konten.spec.ts` merah pada versi yang memfokus saat pasang.
  //
  // Dibandingkan lewat NILAI langkah, bukan bendera "sekali saja": efek React
  // 18 dijalankan DUA KALI oleh StrictMode di pengembangan, dan bendera akan
  // memfokus pada jalannya yang kedua — cacat yang sama, hanya di dev.
  useEffect(() => {
    if (langkahSebelumnya.current !== null && langkahSebelumnya.current !== langkah) {
      judulRef.current?.focus();
    }
    langkahSebelumnya.current = langkah;
  }, [langkah]);

  const simpan = useMutation({
    mutationFn: (perubahan: Parameters<typeof updateAccessibility>[1]) =>
      updateAccessibility(klien, perubahan),
  });

  /** Tutup wizard: tandai selesai, lalu serahkan perpindahan ke pemanggil. */
  function tutup() {
    const sub = idPenggunaSaatIni();
    // `sub` null (token hilang/rusak) hanya berarti penandanya tidak bisa
    // ditulis — wizard tetap ditutup. Menahan pengguna di sini karena kita
    // gagal mencatat sesuatu untuk diri kita sendiri adalah kesalahan yang
    // lebih besar daripada menampilkannya sekali lagi nanti.
    if (sub !== null) tandaiOnboardingSelesai(sub);
    onKeluar();
  }

  async function selesaikan() {
    // (a) Store lokal SUDAH tertulis — tiap perubahan kendali di langkah
    //     "preferensi" menulisnya seketika (live preview). Tidak ada penulisan
    //     susulan di sini, dan itu yang membuat pratinjau tidak bisa berbohong.
    // (b) Sisi server:
    try {
      await simpan.mutateAsync(store.getState().efektif());
    } catch {
      // GAGAL KIRIM TIDAK MEMBATALKAN APA PUN DI SISI PENGGUNA, dan itu
      // keputusan — bukan kelalaian. Preferensinya sudah berlaku di perangkat
      // ini dan tetap berlaku; yang belum terjadi hanyalah penyalinannya ke
      // akun. Mengembalikannya ke semula demi "konsisten dengan server" berarti
      // layar pengguna berubah sendiri karena jaringannya buruk.
      //
      // PENANDA SELESAI TETAP DITULIS, SEKARANG JUGA. Menampilkan ulang seluruh
      // wizard pada pemuatan berikutnya karena satu permintaan gagal jauh lebih
      // mengganggu daripada satu set preferensi yang belum tersinkron — dan
      // panel pengaturan (PR-036) adalah tempat yang benar memperbaikinya.
      const sub = idPenggunaSaatIni();
      if (sub !== null) tandaiOnboardingSelesai(sub);

      // YANG TIDAK DILAKUKAN DI SINI: berpindah halaman sendiri.
      //
      // Berpindah pada detik yang sama akan melepas komponen ini sebelum
      // `role="alert"`-nya sempat dirender satu frame pun — yaitu "menampilkan"
      // pesan yang tidak pernah dilihat maupun didengar siapa pun. Karena
      // penandanya sudah tertulis, menunggu di sini tidak memblokir apa pun:
      // wizard ini tetap tidak akan muncul lagi, dan tombolnya berganti menjadi
      // satu jalan keluar yang jelas.
      return;
    }
    tutup();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-3xl font-bold text-gray-900">{t("onboarding.judul")}</h1>
      <p className="text-base text-gray-900">{t("onboarding.deskripsi")}</p>

      {/*
        INDIKATOR PROGRES sebagai daftar berurut, bukan deret <div> berwarna.
        Warna sendirian melanggar WCAG 1.4.1, dan `<ol>` memberi pengguna screen
        reader dua hal sekaligus: berapa banyak langkahnya, dan yang mana yang
        sedang dibuka (`aria-current="step"`).
      */}
      <nav aria-label={t("onboarding.progres.label")}>
        <ol className="flex list-none flex-wrap gap-2 p-0">
          {LANGKAH.map((l, i) => (
            <li
              key={l}
              aria-current={i === state.indeks ? "step" : undefined}
              className={
                i === state.indeks
                  ? "rounded-md border border-gray-900 bg-gray-900 px-3 py-1 text-sm font-semibold text-white"
                  : "rounded-md border border-gray-400 px-3 py-1 text-sm font-normal text-gray-900"
              }
            >
              {t(JUDUL[l])}
            </li>
          ))}
        </ol>
      </nav>

      {/*
        Selalu dirender, juga saat isinya belum berganti: live region yang lahir
        BERSAMA pesannya kerap tidak terbaca sama sekali (pola yang sama dengan
        `WilayahMemuat`, PR-028b).
      */}
      <p role="status" className="sr-only">
        {t("onboarding.progres.status", {
          nomor,
          total: LANGKAH.length,
          nama: t(JUDUL[langkah]),
        })}
      </p>

      <section aria-labelledby="onboarding-langkah-judul" className="flex flex-col gap-4">
        {/*
          `tabIndex={-1}` supaya judul ini bisa MENERIMA fokus terprogram saat
          langkahnya berganti. Ia tidak masuk urutan Tab — nilainya negatif.
        */}
        <h2
          id="onboarding-langkah-judul"
          ref={judulRef}
          tabIndex={-1}
          className="text-2xl font-semibold text-gray-900"
        >
          {t(JUDUL[langkah])}
        </h2>

        {langkah === "ragam" && <LangkahRagamDisabilitas terpilih={ragam} onUbah={setRagam} />}
        {langkah === "persetujuan" && (
          <LangkahPersetujuan setuju={setuju} onUbah={setSetuju} jumlahDipilih={ragam.length} />
        )}
        {langkah === "preferensi" && <LangkahPreferensi store={store} />}
        {langkah === "ringkasan" && (
          <LangkahRingkasan store={store} ragam={ragam} setuju={setuju} />
        )}
      </section>

      {simpan.isError ? (
        // `role="alert"`: kegagalan ini muncul tanpa pengguna meminta apa pun,
        // jadi ia harus terdengar — bukan hanya terlihat.
        //
        // DUA KALIMAT, dan yang kedua yang paling penting. Kalimat pertama
        // datang dari amplop galat (`{code, message, hint}`); kalimat kedua
        // adalah satu-satunya yang bisa menjawab "lalu pilihan saya bagaimana"
        // — dan jawabannya "tetap berlaku", sebab store lokal memang tidak
        // dibatalkan oleh kegagalan ini.
        <div role="alert" className="flex flex-col gap-1">
          <p className="text-base font-semibold text-gray-900">
            {pesanGalatSimpan(simpan.error, t)}
          </p>
          <p className="text-base text-gray-900">{t("onboarding.galat.tetapBerlaku")}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {state.indeks > 0 && (
          <Tombol
            varian="sekunder"
            onClick={() => {
              kirim({ type: "MUNDUR" });
            }}
          >
            {t("onboarding.aksi.kembali")}
          </Tombol>
        )}

        {langkah === "ringkasan" && simpan.isError ? (
          // Pengirimannya gagal, penandanya SUDAH ditulis, dan preferensinya
          // sudah berlaku. Yang tersisa hanyalah jalan keluar yang jelas.
          <Tombol onClick={onKeluar}>{t("onboarding.aksi.lanjutkanSaja")}</Tombol>
        ) : langkah === "ringkasan" ? (
          <Tombol
            // `aria-disabled`, BUKAN `disabled`: tombol yang dinonaktifkan
            // SAAT memegang fokus melepaskan fokus itu ke awal dokumen di
            // sebagian peramban, dan tombol ini pasti sedang dipegang fokus
            // ketika ditekan. Yang menahan klik kedua adalah penjaga di handler.
            aria-disabled={simpan.isPending}
            aria-busy={simpan.isPending}
            onClick={() => {
              if (simpan.isPending) return;
              void selesaikan();
            }}
          >
            {simpan.isPending ? t("onboarding.aksi.menyimpan") : t("onboarding.aksi.selesai")}
          </Tombol>
        ) : (
          <Tombol
            onClick={() => {
              kirim({ type: "MAJU" });
            }}
          >
            {t("onboarding.aksi.lanjut")}
          </Tombol>
        )}

        {/*
          TERSEDIA DI SETIAP LANGKAH (AC 1). Ditaruh paling akhir dalam urutan
          Tab supaya ia tidak menjadi hal pertama yang tersentuh — tetapi tetap
          hadir, tanpa perlu digali, di layar mana pun.
        */}
        <Tombol varian="hening" onClick={tutup}>
          {t("onboarding.aksi.lewati")}
        </Tombol>
      </div>
    </div>
  );
}
