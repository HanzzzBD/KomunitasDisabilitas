// Penjaga katalog i18n — AC PR-029 nomor 2 & 4.
//
// PEMBAGIAN TUGAS yang perlu dipahami sebelum menambah aturan di sini:
//
//   TIPE menjamin kedua varian ADA (`EntriTeks`, PR-029a). Varian yang hilang
//   adalah `typecheck` merah, jadi TIDAK perlu diuji ulang di sini.
//
//   Penjaga ini menangani yang TIDAK bisa dijamin tipe: varian simple yang
//   disalin mentah dari `id`, struktur katalog per fitur, dan kunci yang saling
//   menimpa diam-diam.
//
// Panduan menulis varian simple: docs/panduan-bahasa-sederhana.md
import { describe, expect, it } from "vitest";
import { fiturKatalog, katalog } from "../src/shared/i18n/katalog/index.js";
import { MODE_BAHASA } from "../src/shared/i18n/tipe.js";

/**
 * Entri yang varian `id`-nya SAMA PERSIS dengan `id-simple`, beserta alasannya.
 *
 * Menyalin `id` ke `id-simple` adalah cara termudah membuat katalog tampak
 * "lengkap" tanpa benar-benar menulis varian sederhananya — dan tipe tidak bisa
 * membedakan salinan malas dari kalimat yang memang sudah sesederhana mungkin.
 * Yang bisa membedakan hanya manusia, jadi penjaga ini memaksa manusia itu
 * menuliskan keputusannya.
 */
const SAMA_DENGAN_SENGAJA: Readonly<Record<string, string>> = {
  "shell.merek": "Nama produk — tidak diterjemahkan dan tidak disederhanakan.",
  "shell.aksi.masuk": "Satu kata sehari-hari; tidak ada bentuk yang lebih sederhana.",
  "shell.luring.cobaLagi": "Label tombol dua kata, sudah memakai kata sehari-hari.",

  // --- auth (PR-030b) ---
  // Sebagian besar di sini adalah LABEL, bukan kalimat. Label yang panjangnya
  // dua-tiga kata sehari-hari tidak punya bentuk yang lebih sederhana, dan
  // mengarang perbedaan hanya membuat kedua varian tidak konsisten satu sama
  // lain — pengguna yang berpindah mode akan menyangka tombolnya berubah.
  "auth.judul": "Nama produk plus dua kata sehari-hari.",
  "auth.nomor.label": "Label dua kata; 'Nomor HP' adalah sebutan sehari-harinya.",
  "auth.nomor.kirim": "Label tombol dua kata sehari-hari.",
  "auth.nomor.mengirim": "Kalimat penanda tunggu, sudah sependek mungkin.",
  "auth.kode.label": "Label yang sudah menyebut bentuknya secara harfiah ('6 angka').",
  "auth.kode.takValid":
    "Kalimat empat kata; menyederhanakannya hanya mengubah kata tanpa menambah kejelasan.",
  "auth.kode.masuk": "Satu kata sehari-hari, sama dengan label aksi di shell.",
  "auth.kode.memeriksa": "Kalimat penanda tunggu, sudah sependek mungkin.",
  "auth.kode.terkirim": "Kalimat empat kata dengan kata sehari-hari.",
  "auth.google.atau": "Satu kata penghubung; tidak ada bentuk yang lebih sederhana.",
  "auth.google.kembali": "Label tautan empat kata sehari-hari, sudah menyebut tujuannya.",

  // --- beranda (PR-032a) ---
  "beranda.hero.daftar": "Ajakan dua kata sehari-hari; label CTA tidak punya bentuk lebih sederhana.",
  "beranda.cara.judul": "Judul bagian tiga kata, seluruhnya kata sehari-hari.",
  "beranda.penutup.daftar":
    "Label tautan tiga kata sehari-hari, dan 'daftar'/'masuk' harus SAMA di kedua varian — " +
    "keduanya muncul lagi di halaman masuk, dan pengguna mencocokkan kata yang tadi ia tekan.",

  // --- shell (PR-032b) ---
  "shell.kesalahan.perluMasuk.masuk":
    "Label aksi empat kata sehari-hari. 'Masuk' harus SAMA dengan label di " +
    "halaman tujuan — pengguna mencocokkan kata yang tadi ia tekan.",

  // --- pengaturan (PR-033a) ---
  // Sebagian besar di sini LABEL, bukan kalimat — pola yang sama dengan auth.
  // Yang perlu dibaca dua kali hanyalah dua nama bagian di bawah.
  "pengaturan.judul": "Satu kata sehari-hari; nama halaman tidak punya bentuk lebih sederhana.",
  "pengaturan.nav.label":
    "Nama landmark navigasi — dibacakan screen reader, tidak tampil di layar. Dua kata sehari-hari.",
  "pengaturan.nav.aksesibilitas":
    "Harus SAMA dengan judul panel tujuannya (`pengaturan.aksesibilitas.judul`) — pengguna " +
    "mencocokkan kata yang tadi ia tekan dengan judul halaman yang terbuka.",
  "pengaturan.akun.nama": "Label satu kata sehari-hari.",
  "pengaturan.akun.email": "Label satu kata; 'email' adalah sebutan sehari-harinya di Indonesia.",
  "pengaturan.akun.nomor": "Label dua kata; sama dengan label di halaman masuk (`auth.nomor.label`).",
  "pengaturan.akun.belumDiisi": "Dua kata sehari-hari, sudah menyebut keadaannya secara harfiah.",
  "pengaturan.akun.cobaLagi": "Label tombol dua kata, sama dengan `shell.luring.cobaLagi`.",
  // --- hapus akun (PR-033c-1) ---
  // Sebagian besar LABEL. Dua di antaranya — `hapus.tombol` dan
  // `kode.konfirmasi` — sengaja identik meski kalimatnya panjang: keduanya
  // menyebut akibatnya secara harfiah ("Hapus akun saya", "Hapus akun saya
  // sekarang"), dan tidak ada bentuk yang lebih sederhana tanpa MENGABURKAN
  // apa yang akan terjadi. Pada tombol paling final di seluruh aplikasi,
  // mengaburkan adalah kesalahan yang lebih besar daripada mengulang.
  "pengaturan.hapus.judul": "Label dua kata sehari-hari; nama bagian tidak punya bentuk lebih sederhana.",
  "pengaturan.hapus.tombol":
    "Menyebut akibatnya secara harfiah. Menyederhanakannya hanya bisa dengan mengaburkan, " +
    "dan pada tombol ini kabur jauh lebih berbahaya daripada panjang.",
  "pengaturan.hapus.batal": "Satu kata sehari-hari; jalan keluar harus dikenali seketika.",
  "pengaturan.hapus.akibat.judul": "Tiga kata sehari-hari yang sudah menyebut isinya secara harfiah.",
  "pengaturan.hapus.kode.terkirim":
    "Kalimat lima kata dengan kata sehari-hari; nomornya disisipkan apa adanya.",
  "pengaturan.hapus.kode.label": "Label yang sudah menyebut bentuknya secara harfiah ('6 angka').",
  "pengaturan.hapus.kode.konfirmasi":
    "Label tombol paling final di aplikasi ini. Ia menyebut persis apa yang akan terjadi; " +
    "varian yang lebih pendek akan mengurangi kejelasan tepat di tempat yang paling menuntutnya.",
  "pengaturan.hapus.selesai.judul":
    "Kalimat empat kata sehari-hari yang menyatakan keadaan secara harfiah.",

  // --- hapus akun lewat Google (PR-033c-2) ---
  "pengaturan.hapus.google.lanjut":
    "Label tombol tiga kata sehari-hari. 'Google' adalah nama layanan — tidak diterjemahkan " +
    "dan tidak disederhanakan, sama seperti nama produk.",
  "pengaturan.hapus.kembali.masuk":
    "Label aksi empat kata sehari-hari, sama persis dengan `shell.kesalahan.perluMasuk.masuk` — " +
    "keduanya mengantar ke halaman yang sama, dan dua nama untuk satu tujuan membuat pengguna " +
    "menyangka ia sedang menuju tempat yang berbeda.",

  "pengaturan.ekspor.tombol":
    "Label tombol tiga kata sehari-hari. 'Unduh' harus SAMA di kedua varian — ia muncul lagi " +
    "di kalimat pengumuman dan di judul bagiannya, dan pengguna mencocokkan kata yang tadi ia tekan.",
  "pengaturan.aksesibilitas.judul":
    "ISTILAH PRODUK, dan sengaja tidak disederhanakan. Kata ini muncul di navigasi, di judul " +
    "panel, dan kelak di seluruh panel preferensi (PR-036); menggantinya hanya di mode sederhana " +
    "berarti satu tempat yang sama punya dua nama, dan pengguna yang berpindah mode akan " +
    "menyangka ia tersesat.",

  // --- shell (PR-032a) ---
  "shell.judulDokumen":
    "Pola judul tab, bukan kalimat: isinya hanya nama halaman + nama produk, dan " +
    "keduanya sudah disederhanakan di kuncinya masing-masing.",
};

const entri = Object.entries(katalog) as ReadonlyArray<
  readonly [string, Readonly<Record<string, string>>]
>;

function identik([, e]: readonly [string, Readonly<Record<string, string>>]): boolean {
  return e.id === e["id-simple"];
}

describe("katalog — varian simple yang disalin mentah", () => {
  it("setiap entri identik SUDAH didaftarkan beserta alasannya", () => {
    const belumTerdaftar = entri
      .filter(identik)
      .map(([kunci]) => kunci)
      .filter((kunci) => !Object.hasOwn(SAMA_DENGAN_SENGAJA, kunci));

    expect(
      belumTerdaftar,
      "Varian `id-simple` sama persis dengan `id`. Tulis varian sederhananya " +
        "(lihat docs/panduan-bahasa-sederhana.md), atau daftarkan di " +
        "SAMA_DENGAN_SENGAJA beserta alasannya bila kalimatnya memang sudah sederhana.",
    ).toEqual([]);
  });

  it("daftar pengecualian tidak menyimpan entri basi", () => {
    // Arah sebaliknya. Tanpa ini, kunci yang sudah diperbaiki varian
    // sederhananya akan meninggalkan alasan yang tidak lagi benar — dan daftar
    // pengecualian yang memuat kebohongan berhenti bisa dipercaya.
    const takLagiIdentik = Object.keys(SAMA_DENGAN_SENGAJA).filter((kunci) => {
      const e = katalog[kunci as keyof typeof katalog] as Record<string, string> | undefined;
      return e === undefined || e.id !== e["id-simple"];
    });

    expect(
      takLagiIdentik,
      "Entri ini tidak lagi identik (atau kuncinya sudah hilang) — hapus dari SAMA_DENGAN_SENGAJA.",
    ).toEqual([]);
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    // Katalog kosong akan membuat kedua test di atas lulus tanpa memeriksa apa
    // pun. Dan bila SEMUA entri identik, katalog `id-simple` sesungguhnya tidak
    // pernah ditulis.
    expect(entri.length).toBeGreaterThan(5);
    expect(entri.filter(identik).length).toBeLessThan(entri.length / 2);
  });
});

describe("katalog — struktur per fitur (AC 4)", () => {
  it("setiap kunci berprefiks nama fiturnya", () => {
    // Prefiks yang cocok dengan berkasnya membuat kunci bisa dilacak dengan
    // grep apa adanya — dan mencegah satu fitur menaruh kuncinya di katalog
    // fitur lain, tempat ia tidak akan pernah dicari.
    for (const { nama, entri: milikFitur } of fiturKatalog) {
      for (const kunci of Object.keys(milikFitur)) {
        expect(kunci.startsWith(`${nama}.`), `kunci "${kunci}" tidak berprefiks "${nama}."`).toBe(
          true,
        );
      }
    }
  });

  it("tidak ada kunci yang saling menimpa antar fitur", () => {
    // Katalog dirakit dengan spread; kunci kembar akan menimpa DIAM-DIAM, dan
    // fitur yang kalah kehilangan teksnya tanpa satu pun galat.
    const semua = fiturKatalog.flatMap(({ entri: e }) => Object.keys(e));
    expect(semua).toHaveLength(new Set(semua).size);
  });

  it("`katalog` dan `fiturKatalog` memuat kunci yang sama", () => {
    // Keduanya sengaja terpisah (lihat catatan di katalog/index.ts). Penjaga
    // ini yang membuat pemisahan itu aman: fitur yang ditambahkan ke salah satu
    // saja langsung merah.
    const dariFitur = fiturKatalog.flatMap(({ entri: e }) => Object.keys(e)).sort();
    expect(Object.keys(katalog).sort()).toEqual(dariFitur);
  });

  it("setiap fitur menyumbang setidaknya satu kunci", () => {
    for (const { nama, entri: e } of fiturKatalog) {
      expect(Object.keys(e).length, `fitur "${nama}" kosong`).toBeGreaterThan(0);
    }
  });
});

describe("katalog — isi entri", () => {
  it("tidak ada varian kosong", () => {
    // Tipe menjamin field-nya ADA; string kosong tetap lolos tipe dan akan
    // tampil sebagai ruang hampa di layar.
    for (const [kunci, e] of entri) {
      for (const mode of MODE_BAHASA) {
        expect(e[mode]?.trim(), `"${kunci}" varian ${mode} kosong`).not.toBe("");
      }
    }
  });

  it("tidak ada spasi menggantung di awal/akhir", () => {
    // Spasi tak sengaja terbaca screen reader sebagai jeda dan menggeser
    // tata letak — tidak terlihat saat review, terlihat di layar.
    for (const [kunci, e] of entri) {
      for (const mode of MODE_BAHASA) {
        expect(e[mode], `"${kunci}" varian ${mode} punya spasi menggantung`).toBe(e[mode]?.trim());
      }
    }
  });
});
