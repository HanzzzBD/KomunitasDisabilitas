// Penjaga untuk GERBANGNYA sendiri — AC PR-031: "Pelanggaran axe fixture →
// CI merah (bukti)" dan "Laporan kegagalan menyebut elemen + aturan".
//
// Di pemakaian normal, gerbang ini diharapkan SELALU hijau. Artinya jalur
// merahnya tidak akan pernah dieksekusi oleh test biasa — dan gerbang yang
// jalur gagalnya tidak pernah dijalankan bukan gerbang, melainkan keyakinan.
// Berkas ini menjalankannya dengan sengaja.
import { describe, expect, it } from "vitest";
import {
  TAK_BISA_DI_JSDOM,
  harusLolosAksesibilitas,
  laporkan,
  periksaAksesibilitas,
} from "../src/pengujian/index.js";

/** Pasang markup ke document — axe butuh elemen yang benar-benar terpasang. */
function pasang(html: string): HTMLElement {
  const wadah = document.createElement("div");
  wadah.innerHTML = html;
  document.body.appendChild(wadah);
  return wadah;
}

describe("gerbang axe MENANGKAP pelanggaran", () => {
  it("gambar tanpa teks alternatif → gagal", async () => {
    const el = pasang(`<img src="/foto.png">`);
    await expect(harusLolosAksesibilitas(el)).rejects.toThrow(/pelanggaran aksesibilitas/i);
  });

  it("tombol tanpa nama yang bisa dibaca → gagal", async () => {
    // Tombol ikon tanpa label adalah cacat paling lazim di produk mana pun,
    // dan sepenuhnya tak terlihat bagi yang melihat layar.
    const el = pasang(`<button type="button"><span aria-hidden="true">×</span></button>`);
    await expect(harusLolosAksesibilitas(el)).rejects.toThrow();
  });

  it("aria-labelledby menunjuk id yang TIDAK ADA → gagal", async () => {
    // Jenis kerusakan yang tidak bisa dilihat lint: id-nya mungkin ada di
    // berkas lain, dan mungkin juga tidak.
    const el = pasang(`<input aria-labelledby="tidak-ada-id">`);
    await expect(harusLolosAksesibilitas(el)).rejects.toThrow();
  });

  it("markup yang benar → lolos", async () => {
    const el = pasang(
      `<main><h1>Judul</h1><img src="/foto.png" alt="Peta kantor"><button type="button">Simpan</button></main>`,
    );
    await expect(harusLolosAksesibilitas(el)).resolves.toBeUndefined();
  });
});

describe("laporan kegagalan bisa ditindaklanjuti", () => {
  it("menyebut ATURAN, ELEMEN, dan cara memperbaikinya", async () => {
    const el = pasang(`<img src="/foto.png">`);
    const hasil = await periksaAksesibilitas(el);
    const teks = laporkan(hasil);

    // Nama aturan — supaya bisa dicari.
    expect(teks).toContain("image-alt");
    // Elemen — tanpa ini, komponen dengan sepuluh gambar menyisakan pencarian manual.
    expect(teks).toContain("img");
    // Rujukan — supaya orang yang belum tahu aturannya bisa belajar, bukan menebak.
    expect(teks).toContain("https://");
  });

  it("pesan galat menyebut BATAS pemeriksaannya", async () => {
    // Gerbang yang diam soal batasnya melahirkan rasa aman palsu — persis
    // risiko yang ditulis dokumen phase ("axe ≠ WCAG penuh").
    const el = pasang(`<img src="/foto.png">`);
    const galat = await harusLolosAksesibilitas(el).catch((e: Error) => e);

    expect((galat as Error).message).toContain("color-contrast");
    expect((galat as Error).message).toMatch(/TIDAK ikut diperiksa/i);
  });
});

describe("batas jsdom dicatat eksplisit", () => {
  it("aturan yang butuh rendering dimatikan, bukan dibiarkan diam-diam gagal", () => {
    // Dibiarkan menyala, axe melaporkannya "incomplete" — tidak lulus, tidak
    // gagal, dan tidak terlihat. Dimatikan eksplisit, hilangnya cakupan ini
    // menjadi daftar yang bisa dibaca dan harus ditutup PR-031b.
    expect(TAK_BISA_DI_JSDOM).toContain("color-contrast");
    expect(TAK_BISA_DI_JSDOM).toContain("target-size");
  });

  it("kontras yang jelas buruk memang TIDAK tertangkap di sini", async () => {
    // Bukti jujur bahwa lapisan ini punya lubang, bukan klaim bahwa ia lengkap.
    // PR-031b yang menutupnya dengan browser sungguhan.
    const el = pasang(
      `<p style="color:#fff;background:#fff">Teks putih di atas putih</p>`,
    );
    await expect(harusLolosAksesibilitas(el)).resolves.toBeUndefined();
  });
});
