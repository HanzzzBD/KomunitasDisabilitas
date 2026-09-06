// modules/notifications — katalog + perakit email (PR-049a).
//
// KENAPA KATALOG TERSENDIRI, TERPISAH DARI `template.service.ts`. Katalog itu
// melayani `NotificationType` — tipe yang SELALU punya baris `notifications`
// dan selalu punya layar tempat pengguna bisa membacanya lagi. Kabar di berkas
// ini justru kebalikannya: `akun_dihapus` dikirim kepada orang yang akunnya baru
// saja dihapus, yang karena itu TIDAK punya sesi dan TIDAK punya layar. Ia bukan
// notifikasi yang kebetulan lewat email; ia kabar yang hanya ada sebagai email.
// Menggabungkannya ke katalog notifikasi akan menuntut baris `notifications`
// yang tak seorang pun bisa baca, dan tipe notifikasi yang tak pernah tampil di
// notification center (PR-050).
//
// KABAR DI SINI TIDAK TUNDUK PADA PREFERENSI KANAL (PR-049b). Preferensi mengatur
// kabar yang punya kanal lain — status lamaran tetap terbaca di layar lamaran
// meski emailnya dimatikan. Kabar pasca-hapus tidak punya kanal lain sama sekali,
// jadi opt-out yang membungkamnya bukan lagi preferensi melainkan lubang:
// pengguna yang pernah mematikan email berbulan-bulan lalu akan kehilangan
// satu-satunya bukti bahwa akunnya dihapus, sekaligus satu-satunya cara ia tahu
// jendela pembatalan 30 hari itu ada.
//
// TIGA ATURAN AKSESIBILITAS YANG DITEGAKKAN PERAKIT DI BAWAH (AC-2 dokumen phase):
//
//   1. BAGIAN TEKS POLOS SELALU IKUT. Ia bukan cadangan: klien email berbasis
//      teks dan sebagian pembaca layar membacanya, dan pesan tanpa bagian ini
//      juga dinilai lebih mungkin spam oleh penyaring.
//   2. TIDAK ADA GAMBAR SAMA SEKALI. Karena itu tidak ada `alt` yang bisa lupa
//      ditulis, tidak ada teks yang hilang saat klien memblokir gambar (bawaan
//      Gmail dan Outlook), dan tidak ada piksel pelacak yang tidak kita minta.
//   3. WARNA MEMENUHI 4.5:1 DAN TIDAK MENJADI SATU-SATUNYA PEMBAWA MAKNA.
//      Nilainya ditulis di `WARNA` di bawah beserta rasio terukurnya.
//
// DAN SATU ATURAN KEAMANAN: TIDAK ADA TAUTAN. Pesan yang meminta orang mengeklik
// sesuatu tepat setelah kejadian mencurigakan berbentuk sama persis dengan
// phishing. Alasan yang sama sudah ditulis di `account.service.ts` (PR-021) untuk
// pesan SMS-nya, dan berlaku lebih kuat di sini: email jauh lebih mudah
// dipalsukan daripada SMS.
import { HARI_SEBELUM_PURGE, type NotificationText, type NotifyEmailJenis } from "@nawasena/schemas";
import type { TeksNotifikasi } from "./template.service.js";

/**
 * Jenis email yang kalimatnya ditulis DI SINI.
 *
 * Sengaja bukan seluruh `NotifyEmailJenis`: sejak PR-049b ada jenis
 * `notifikasi`, yang kalimatnya justru TIDAK ditulis di berkas ini — ia dirakit
 * renderer notifikasi yang sama dengan yang melayani layar dan push. Katalog
 * yang memaksa jenis itu punya entri di sini akan melahirkan salinan kalimat
 * kedua, persis yang dicegah `template.service.ts`.
 *
 * Kelengkapannya tetap ditegakkan tipe, hanya pindah tempat: `switch (jenis)`
 * di `email.service.ts` ditutup pemeriksaan `never`, sehingga jenis baru tanpa
 * jalur render adalah `typecheck` merah.
 */
export type EmailJenisBerkatalog = Extract<NotifyEmailJenis, "akun_dihapus">;

/** Satu template email: judul surat, judul isi, dan paragrafnya. */
export interface TemplateEmail {
  subject: NotificationText;
  heading: NotificationText;
  /** Satu entri = satu paragraf. Satu gagasan per paragraf. */
  paragraf: readonly NotificationText[];
}

/**
 * Warna, beserta rasio kontrasnya terhadap latar. Ditulis di sini dan bukan
 * disebar ke dalam string HTML supaya angkanya bisa dibaca dan diperiksa ulang
 * tanpa membaca markup.
 *
 * Kontras terhadap `#ffffff`:
 *   teks   #1f2933 → 14.9:1  (AA butuh 4.5:1)
 *   redup  #52606d →  7.0:1  (dipakai untuk keterangan, tetap jauh di atas
 *                             4.5:1 — "teks sekunder" bukan alasan turun di
 *                             bawah AA)
 */
const WARNA = { latar: "#ffffff", teks: "#1f2933", redup: "#52606d" } as const;

/** Kalimat penutup yang sama pada kedua bentuk badan pesan. */
const PENUTUP = "Email ini dikirim otomatis oleh Nawasena. Anda tidak perlu membalasnya.";

/**
 * KATALOG EMAIL. Kuncinya SELURUH `NotifyEmailJenis` — `satisfies` membuat jenis
 * baru tanpa template menjadi `typecheck` merah, bukan email kosong yang lolos.
 *
 * Isi `akun_dihapus` memuat tiga hal, persis seperti pesan SMS-nya (PR-021): apa
 * yang terjadi, sampai kapan bisa dibatalkan, dan apa yang harus dilakukan bila
 * ini bukan dia. Kalimatnya sendiri TIDAK disalin dari sana — SMS punya batas
 * panjang yang email tidak punya, dan memaksakan satu string untuk dua bentuk
 * akan membuat keduanya lebih buruk. Yang tidak boleh menyimpang hanyalah
 * ANGKANYA, dan itu sudah dijamin konstanta bersama `HARI_SEBELUM_PURGE`.
 */
export const EMAIL_TEMPLATE = {
  akun_dihapus: {
    subject: {
      id: "Akun Nawasena Anda sudah dihapus",
      // Sudah sederhana apa adanya. Varian ini tetap ditulis penuh, bukan
      // dibiarkan kosong lalu jatuh ke `id`: kolom yang boleh kosong adalah
      // kolom yang suatu saat lupa diisi.
      "id-simple": "Akun Nawasena Anda sudah dihapus",
    },
    heading: {
      id: "Akun Anda sudah dihapus",
      "id-simple": "Akun Anda sudah dihapus",
    },
    paragraf: [
      {
        id: "Kami menerima permintaan penghapusan akun Nawasena Anda, dan akun itu sudah dihapus.",
        "id-simple": "Ada permintaan untuk menghapus akun Nawasena Anda. Akun itu sudah kami hapus.",
      },
      {
        id: `Data Anda masih bisa dipulihkan dalam ${HARI_SEBELUM_PURGE} hari sejak email ini. Setelah itu data Anda dihapus permanen dan tidak bisa dikembalikan.`,
        // Dipecah menjadi kalimat-kalimat pendek, satu gagasan masing-masing,
        // dan tenggatnya disebut sebagai sesuatu yang masih bisa dilakukan.
        "id-simple": `Anda masih bisa membatalkan ini. Waktunya ${HARI_SEBELUM_PURGE} hari sejak email ini. Lewat dari itu, data Anda hilang selamanya.`,
      },
      {
        id: "Bila Anda tidak merasa meminta ini, segera hubungi kami lewat kanal resmi Nawasena yang biasa Anda pakai. Kami tidak pernah meminta kata sandi atau kode lewat email.",
        // Kalimat anti-phishing DIPERTAHANKAN penuh di varian sederhana, bukan
        // dipangkas: justru pembaca yang paling terbantu bahasa sederhana yang
        // paling perlu tahu bahwa email ini tidak akan pernah meminta kode.
        "id-simple":
          "Anda tidak meminta ini? Segera hubungi kami lewat kanal resmi Nawasena yang biasa Anda pakai. Kami tidak pernah meminta kata sandi atau kode lewat email.",
      },
    ],
  },
} as const satisfies Record<EmailJenisBerkatalog, TemplateEmail>;

/** Satu email yang siap dikirim, dalam satu varian bahasa. */
export interface IsiEmail {
  subject: string;
  html: string;
  text: string;
}

/** `&`, `<`, `>` dalam kalimat kita sendiri — tetap di-escape sebagai kebiasaan. */
function escapeHtml(teks: string): string {
  return teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pilih(teks: NotificationText, sederhana: boolean): string {
  return sederhana ? teks["id-simple"] : teks.id;
}

/**
 * Kerangka HTML email.
 *
 * `lang="id"` ADA DAN PENTING: tanpanya pembaca layar melafalkan kalimat Bahasa
 * Indonesia dengan aturan bunyi bahasa bawaan sistem, dan hasilnya tidak bisa
 * dipahami siapa pun. Ini kegagalan aksesibilitas paling sering pada email, dan
 * paling murah dihindari.
 *
 * Gaya ditulis INLINE, bukan di blok `style`: sebagian besar klien email
 * membuang blok itu, dan gaya yang hilang di sana akan menjatuhkan kembali
 * kontras yang sudah dihitung di atas ke warna bawaan klien.
 *
 * Lebar dibatasi 32rem supaya barisnya tetap pendek (CLAUDE.md §5.2 butir 6).
 * Ukuran huruf 16px dan tinggi baris 1,6 disebut eksplisit sebab bawaan
 * sebagian klien email jauh lebih kecil.
 */
function rakitHtml(heading: string, paragraf: readonly string[]): string {
  const gayaBody = [
    "margin: 0",
    "padding: 1.5rem",
    `background-color: ${WARNA.latar}`,
    `color: ${WARNA.teks}`,
    "font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    "font-size: 16px",
    "line-height: 1.6",
  ].join("; ");

  const isi = paragraf
    .map((p) => `      <p style="margin: 0 0 1rem;">${escapeHtml(p)}</p>`)
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="id">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${escapeHtml(heading)}</title>`,
    "  </head>",
    `  <body style="${gayaBody};">`,
    '    <main style="max-width: 32rem; margin: 0 auto;">',
    `      <h1 style="margin: 0 0 1rem; font-size: 1.375rem; line-height: 1.3;">${escapeHtml(heading)}</h1>`,
    isi,
    `      <p style="margin: 1.5rem 0 0; color: ${WARNA.redup}; font-size: 0.9375rem;">${PENUTUP}</p>`,
    "    </main>",
    "  </body>",
    "</html>",
  ].join("\n");
}

/**
 * Bagian teks polos. BUKAN HTML yang dilucuti tag-nya — ia dirakit dari sumber
 * yang sama persis, sehingga tidak mungkin tertinggal saat kalimatnya berubah.
 */
function rakitTeks(heading: string, paragraf: readonly string[]): string {
  return [heading, "", ...paragraf.flatMap((p) => [p, ""]), PENUTUP].join("\n");
}

/**
 * Rakit satu email dari katalog.
 *
 * MURNI: tidak menyentuh DB, jam, maupun jaringan — sehingga kedua varian bisa
 * diuji sebagai snapshot yang dibaca manusia saat review, sama seperti
 * `renderNotifikasi` (PR-047).
 */
export function renderEmail(jenis: EmailJenisBerkatalog, sederhana: boolean): IsiEmail {
  const template: TemplateEmail = EMAIL_TEMPLATE[jenis];
  const heading = pilih(template.heading, sederhana);
  const paragraf = template.paragraf.map((p) => pilih(p, sederhana));

  return {
    subject: pilih(template.subject, sederhana),
    html: rakitHtml(heading, paragraf),
    text: rakitTeks(heading, paragraf),
  };
}

/**
 * Rakit email untuk sebuah NOTIFIKASI (PR-049b).
 *
 * Kalimatnya datang dari `renderNotifikasi` — renderer yang SAMA dengan yang
 * melayani layar (PR-047) dan push (PR-048b). Itulah seluruh alasan fungsi ini
 * hanya membungkus, bukan menulis: kalimat yang ditulis ulang per kanal akan
 * berbeda dari yang dibacakan pembaca layar lewat kanal lain, dan tidak ada
 * satu pun test yang bisa menangkap perbedaan itu.
 *
 * Kerangka HTML-nya sama dengan email katalog — termasuk `lang="id"`, bagian
 * teks polos, nihil gambar, dan nihil tautan. Yang terakhir berarti email
 * notifikasi pun tidak membawa tautan "buka lamaran": kabar boleh menyusul
 * pengguna keluar dari aplikasi, tautan bertindak di dalamnya tidak.
 */
export function renderEmailNotifikasi(teks: TeksNotifikasi, sederhana: boolean): IsiEmail {
  const judul = pilih(teks.title, sederhana);
  const isi = [pilih(teks.body, sederhana)];

  return {
    // Subjek = judul notifikasi apa adanya. Menambahkan awalan ("Nawasena:")
    // memakan lebar daftar masuk yang sudah sempit, dan nama pengirim sudah
    // menyebutkannya (EMAIL_FROM).
    subject: judul,
    html: rakitHtml(judul, isi),
    text: rakitTeks(judul, isi),
  };
}
