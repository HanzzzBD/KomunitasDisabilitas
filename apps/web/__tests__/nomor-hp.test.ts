// Normalisasi nomor HP (PR-030b).
//
// Pintu masuk paling sempit di seluruh produk: pengguna yang ditolak di kotak
// pertama tidak menyimpulkan "formatnya kurang rapi", ia menyimpulkan
// aplikasinya tidak bisa dipakai.
import { describe, expect, it } from "vitest";
import { normalkanNomor } from "../src/features/auth/nomor-hp.js";

describe("bentuk yang lazim ditulis manusia DITERIMA", () => {
  it.each([
    ["0 di depan — bentuk paling lazim", "081234567890", "+6281234567890"],
    ["sudah E.164", "+6281234567890", "+6281234567890"],
    ["62 tanpa plus — salinan dari kontak WhatsApp", "6281234567890", "+6281234567890"],
    ["berspasi", "0812 3456 7890", "+6281234567890"],
    ["bertanda hubung", "0812-3456-7890", "+6281234567890"],
    ["bertanda kurung dan titik", "(0812) 3456.7890", "+6281234567890"],
    ["spasi di ujung", "  081234567890  ", "+6281234567890"],
  ])("%s", (_nama, ditulis, harap) => {
    expect(normalkanNomor(ditulis)).toBe(harap);
  });

  it("nomor terpendek dan terpanjang yang sah keduanya lolos", () => {
    // Batas skema: +62 diikuti 8–13 angka.
    expect(normalkanNomor("012345678")).toBe("+6212345678");
    expect(normalkanNomor("01234567890123")).toBe("+621234567890123");
  });
});

describe("yang memang bukan nomor HP Indonesia DITOLAK", () => {
  it.each([
    ["kosong", ""],
    ["spasi saja", "   "],
    ["huruf", "nomor saya"],
    ["nomor negara lain", "+14155552671"],
    ["terlalu pendek", "0812"],
    ["terlalu panjang", "081234567890123456"],
    ["hanya tanda baca", "---"],
  ])("%s", (_nama, ditulis) => {
    expect(normalkanNomor(ditulis)).toBeNull();
  });
});

describe("aturan panjang datang dari skema bersama", () => {
  it("tidak ada regex kedua yang bisa menyimpang dari server", () => {
    // Kalau normalisasi memakai aturan panjangnya sendiri, nomor yang lolos di
    // klien bisa ditolak server (atau sebaliknya) — dan pengguna melihat form
    // yang menerima isiannya lalu gagal tanpa penjelasan.
    // 7 angka setelah +62 = di bawah batas skema, harus ditolak di sini juga.
    expect(normalkanNomor("01234567")).toBeNull();
  });
});
