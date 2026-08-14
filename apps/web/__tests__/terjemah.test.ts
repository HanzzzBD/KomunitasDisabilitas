// Inti i18n diuji sebagai fungsi murni — tanpa merender apa pun. Pemisahan itu
// bukan kerapian: kalau logika pencarian hanya bisa diuji lewat komponen,
// kegagalannya akan terbaca sebagai kegagalan render dan ditelusuri di tempat
// yang salah.
import { describe, expect, it } from "vitest";
import { interpolasi, terjemah } from "../src/shared/i18n/terjemah.js";
import type { KatalogFitur } from "../src/shared/i18n/tipe.js";

const KATALOG: KatalogFitur = {
  "uji.sapa": { id: "Selamat datang, {nama}.", "id-simple": "Halo, {nama}." },
  "uji.panjang": {
    id: "Ekosistem karier inklusif untuk penyandang disabilitas.",
    "id-simple": "Cari kerja yang ramah untuk penyandang disabilitas.",
  },
  // Varian simple kosong — seharusnya dicegah tipe, tetapi katalog bisa datang
  // dari bundel lama. Jalur fallback-nya tetap harus benar.
  "uji.simpleKosong": { id: "Kalimat asli", "id-simple": "" },
};

describe("interpolasi", () => {
  it("mengganti placeholder dengan nilainya", () => {
    expect(interpolasi("Halo, {nama}.", { nama: "Rina" })).toBe("Halo, Rina.");
  });

  it("menerima angka", () => {
    expect(interpolasi("Sisa {n} percobaan", { n: 3 })).toBe("Sisa 3 percobaan");
  });

  it("MEMBIARKAN placeholder yang tidak diberi nilai", () => {
    // Dikosongkan, kalimatnya terbaca wajar tetapi salah. Dibiarkan, kesalahan
    // itu terlihat langsung di layar.
    expect(interpolasi("Halo, {nama}.", { lain: "x" })).toBe("Halo, {nama}.");
  });

  it("tanpa params, pola dikembalikan apa adanya", () => {
    expect(interpolasi("Halo, {nama}.")).toBe("Halo, {nama}.");
  });

  it("TIDAK membaca rantai prototipe", () => {
    // `params[nama] !== undefined` akan menemukan `constructor` dan mencetak
    // teks fungsi ke layar pengguna. `Object.hasOwn` menutup itu.
    expect(interpolasi("{constructor}", {})).toBe("{constructor}");
    expect(interpolasi("{toString}", {})).toBe("{toString}");
  });

  it("AC keamanan: keluarannya STRING BIASA — HTML tidak pernah ditafsirkan", () => {
    // Nilai berbahaya tetap menjadi karakter biasa. React yang merendernya akan
    // meng-escape apa adanya; tidak ada jalan dari sini ke innerHTML.
    const jahat = '<img src=x onerror="alert(1)">';
    const hasil = interpolasi("Halo, {nama}.", { nama: jahat });

    expect(hasil).toBe(`Halo, ${jahat}.`);
    // Yang penting: fungsi ini tidak mengubah apa pun menjadi markup, dan tidak
    // menyediakan cara untuk itu.
    expect(typeof hasil).toBe("string");
  });

  it("placeholder di dalam NILAI tidak ikut diproses ulang", () => {
    // Tanpa ini, nilai yang kebetulan memuat "{nama}" bisa memicu penggantian
    // berantai — pintu masuk yang tidak kentara.
    expect(interpolasi("{a}", { a: "{b}", b: "TEREKSPOS" })).toBe("{b}");
  });
});

describe("terjemah", () => {
  it("memilih varian sesuai mode", () => {
    expect(terjemah(KATALOG, "id", "uji.panjang").teks).toContain("Ekosistem karier inklusif");
    expect(terjemah(KATALOG, "id-simple", "uji.panjang").teks).toContain("Cari kerja yang ramah");
  });

  it("menyisipkan parameter", () => {
    expect(terjemah(KATALOG, "id-simple", "uji.sapa", { nama: "Bayu" }).teks).toBe("Halo, Bayu.");
  });

  it("varian simple kosong → jatuh ke `id`, bukan ke kekosongan", () => {
    const h = terjemah(KATALOG, "id-simple", "uji.simpleKosong");
    expect(h.teks).toBe("Kalimat asli");
    expect(h.hilang).toBe(false);
  });

  it("AC: kunci hilang → menampilkan KUNCI-nya, bukan blank", () => {
    // Layar kosong tidak bisa dilaporkan pengguna; kunci yang muncul di layar
    // bisa langsung dicari di kode.
    const h = terjemah(KATALOG, "id", "uji.tidak.ada");
    expect(h.teks).toBe("uji.tidak.ada");
    expect(h.hilang).toBe(true);
  });

  it("menandai `hilang` supaya pemanggil bisa melapor", () => {
    // `terjemah` sendiri tidak menulis log — kemurniannya yang membuat test ini
    // tidak perlu menyadap console.
    expect(terjemah(KATALOG, "id", "uji.sapa").hilang).toBe(false);
    expect(terjemah(KATALOG, "id", "entah").hilang).toBe(true);
  });
});
