// Katalog email (PR-049a) — snapshot kedua varian + invarian aksesibilitas dan
// keamanan yang tidak boleh hilang tanpa ada yang menyadarinya.
//
// Snapshot DITULIS TANGAN, bukan `toMatchSnapshot()`, dengan alasan yang sama
// seperti `notifications-template.test.ts`: berkas snapshot yang di-regenerate
// otomatis akan menerima kalimat buruk semudah kalimat baik. Kalimat yang
// dibaca manusia saat review adalah satu-satunya penjaga yang benar-benar
// memeriksa isinya.
import { describe, it, expect } from "vitest";
import { HARI_SEBELUM_PURGE } from "@nawasena/schemas";
import { EMAIL_TEMPLATE, renderEmail } from "../src/modules/notifications/index.js";

/**
 * Entri yang varian `id-simple`-nya BOLEH sama dengan `id`, beserta alasannya.
 * Bentuk dan alasannya sama persis dengan `SAMA_DENGAN_SENGAJA` di
 * `notifications-template.test.ts`: tipe tidak bisa membedakan salinan malas
 * dari kalimat yang memang sudah sesederhana mungkin — yang bisa hanya manusia,
 * jadi penjaganya memaksa manusia itu menuliskan keputusannya.
 */
const SAMA_DENGAN_SENGAJA: Partial<Record<string, string>> = {
  "akun_dihapus.subject":
    "Judul surat harus terbaca utuh di daftar masuk yang memotong sekitar 40 karakter. " +
    "Kalimat ini sudah lima kata, semuanya kata sehari-hari; versi 'lebih sederhana' " +
    "hanya akan menambah kata dan justru terpotong.",
  "akun_dihapus.heading":
    "Alasan yang sama dengan subject, dan judul isi sengaja mengulang subject supaya " +
    "pembaca layar yang melompat ke badan pesan mendengar kalimat yang sama.",
};

describe("email akun_dihapus — snapshot kedua varian", () => {
  it("varian baku (id)", () => {
    const isi = renderEmail("akun_dihapus", false);

    expect(isi.subject).toBe("Akun Nawasena Anda sudah dihapus");
    expect(isi.text).toBe(
      [
        "Akun Anda sudah dihapus",
        "",
        "Kami menerima permintaan penghapusan akun Nawasena Anda, dan akun itu sudah dihapus.",
        "",
        "Data Anda masih bisa dipulihkan dalam 30 hari sejak email ini. Setelah itu data Anda dihapus permanen dan tidak bisa dikembalikan.",
        "",
        "Bila Anda tidak merasa meminta ini, segera hubungi kami lewat kanal resmi Nawasena yang biasa Anda pakai. Kami tidak pernah meminta kata sandi atau kode lewat email.",
        "",
        "Email ini dikirim otomatis oleh Nawasena. Anda tidak perlu membalasnya.",
      ].join("\n"),
    );
  });

  it("varian sederhana (id-simple)", () => {
    const isi = renderEmail("akun_dihapus", true);

    expect(isi.text).toBe(
      [
        "Akun Anda sudah dihapus",
        "",
        "Ada permintaan untuk menghapus akun Nawasena Anda. Akun itu sudah kami hapus.",
        "",
        "Anda masih bisa membatalkan ini. Waktunya 30 hari sejak email ini. Lewat dari itu, data Anda hilang selamanya.",
        "",
        "Anda tidak meminta ini? Segera hubungi kami lewat kanal resmi Nawasena yang biasa Anda pakai. Kami tidak pernah meminta kata sandi atau kode lewat email.",
        "",
        "Email ini dikirim otomatis oleh Nawasena. Anda tidak perlu membalasnya.",
      ].join("\n"),
    );
  });

  it("tenggat 30 hari datang dari konstanta bersama, bukan angka yang diketik ulang", () => {
    // Angka ini DIJANJIKAN kepada pengguna di tiga tempat sekaligus (SMS PR-021,
    // layar konfirmasi PR-033c-1, dan email ini) sekaligus DITEGAKKAN job purge
    // (PR-023). Salinan yang menyimpang berarti janji dan perilaku berbeda.
    for (const sederhana of [false, true]) {
      expect(renderEmail("akun_dihapus", sederhana).text).toContain(`${HARI_SEBELUM_PURGE} hari`);
    }
  });
});

describe("invarian aksesibilitas (AC-2)", () => {
  const varian = [
    ["baku", renderEmail("akun_dihapus", false)],
    ["sederhana", renderEmail("akun_dihapus", true)],
  ] as const;

  it.each(varian)("%s — HTML menyatakan bahasanya", (_nama, isi) => {
    // Tanpa `lang`, pembaca layar melafalkan kalimat Bahasa Indonesia dengan
    // aturan bunyi bahasa bawaan sistem, dan hasilnya tidak bisa dipahami
    // siapa pun. Kegagalan aksesibilitas paling sering pada email.
    expect(isi.html).toContain('<html lang="id">');
  });

  it.each(varian)("%s — bagian teks polos tidak kosong dan bukan HTML", (_nama, isi) => {
    expect(isi.text.length).toBeGreaterThan(100);
    expect(isi.text).not.toContain("<");
  });

  it.each(varian)("%s — tidak ada gambar sama sekali", (_nama, isi) => {
    // Tidak ada gambar berarti tidak ada `alt` yang bisa lupa ditulis, tidak
    // ada teks yang hilang saat klien memblokir gambar (bawaan Gmail dan
    // Outlook), dan tidak ada piksel pelacak yang tidak kita minta.
    expect(isi.html).not.toMatch(/<img\b/i);
    expect(isi.html).not.toMatch(/background-image/i);
  });

  it.each(varian)("%s — punya SATU h1, dan itu judul isinya", (_nama, isi) => {
    expect(isi.html.match(/<h1\b/g)).toHaveLength(1);
    expect(isi.html).toContain(">Akun Anda sudah dihapus</h1>");
  });

  it.each(varian)("%s — warna teks ditulis eksplisit, bukan diwarisi klien", (_nama, isi) => {
    // Klien email menerapkan warna bawaannya sendiri (termasuk mode gelap yang
    // membalik latar). Warna yang tidak disebut adalah kontras yang tidak
    // dihitung siapa pun.
    expect(isi.html).toContain("color: #1f2933");
    expect(isi.html).toContain("background-color: #ffffff");
  });

  it.each(varian)("%s — ukuran huruf disebut, sebab bawaan klien lebih kecil", (_nama, isi) => {
    expect(isi.html).toContain("font-size: 16px");
    expect(isi.html).toContain("line-height: 1.6");
  });
});

describe("invarian keamanan", () => {
  it("TIDAK ADA satu pun tautan di kedua varian", () => {
    // Pesan yang meminta orang mengeklik sesuatu tepat setelah kejadian
    // mencurigakan berbentuk sama persis dengan phishing. Alasan yang sama
    // sudah ditulis di account.service.ts untuk pesan SMS-nya, dan berlaku
    // lebih kuat di sini: email jauh lebih mudah dipalsukan daripada SMS.
    for (const sederhana of [false, true]) {
      const isi = renderEmail("akun_dihapus", sederhana);
      expect(isi.html).not.toMatch(/<a\b/i);
      expect(isi.html).not.toMatch(/https?:\/\//i);
      expect(isi.text).not.toMatch(/https?:\/\//i);
    }
  });

  it("kedua varian memperingatkan bahwa kami tidak pernah meminta kode", () => {
    // Peringatan ini DIPERTAHANKAN penuh di varian sederhana, bukan dipangkas:
    // justru pembaca yang paling terbantu bahasa sederhana yang paling perlu
    // tahu bahwa email ini tidak akan pernah meminta kode.
    for (const sederhana of [false, true]) {
      expect(renderEmail("akun_dihapus", sederhana).text).toContain(
        "tidak pernah meminta kata sandi atau kode lewat email",
      );
    }
  });

  it("ketiga isi wajib ada: apa yang terjadi, sampai kapan, apa yang dilakukan", () => {
    // Bentuk yang sama dengan pesan SMS PR-021. Kalimatnya boleh berbeda —
    // SMS punya batas panjang yang email tidak punya — isinya tidak boleh.
    for (const sederhana of [false, true]) {
      const teks = renderEmail("akun_dihapus", sederhana).text.toLowerCase();
      expect(teks).toContain("dihapus");
      expect(teks).toContain("30 hari");
      expect(teks).toContain("hubungi kami");
    }
  });
});

describe("kelengkapan katalog", () => {
  it("setiap entri punya kedua varian, tidak ada yang kosong", () => {
    for (const [jenis, template] of Object.entries(EMAIL_TEMPLATE)) {
      for (const [nama, teks] of [
        ["subject", template.subject],
        ["heading", template.heading],
        ...template.paragraf.map((p, i) => [`paragraf[${i}]`, p] as const),
      ] as const) {
        expect(teks.id.length, `${jenis}.${nama}.id`).toBeGreaterThan(0);
        expect(teks["id-simple"].length, `${jenis}.${nama}.id-simple`).toBeGreaterThan(0);
      }
    }
  });

  it("varian id-simple bukan salinan mentah varian id (kecuali yang didaftarkan)", () => {
    const kembar: string[] = [];

    for (const [jenis, template] of Object.entries(EMAIL_TEMPLATE)) {
      const periksa = (nama: string, teks: { id: string; "id-simple": string }) => {
        const kunci = `${jenis}.${nama}`;
        if (teks.id === teks["id-simple"] && SAMA_DENGAN_SENGAJA[kunci] === undefined) {
          kembar.push(kunci);
        }
      };
      periksa("subject", template.subject);
      periksa("heading", template.heading);
      template.paragraf.forEach((p, i) => periksa(`paragraf[${i}]`, p));
    }

    expect(
      kembar,
      "varian id-simple identik dengan id — tulis varian sederhananya, atau daftarkan alasannya di SAMA_DENGAN_SENGAJA",
    ).toEqual([]);
  });
});
