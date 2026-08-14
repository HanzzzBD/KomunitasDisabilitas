// AC PR-030 nomor 5, bagian "kembali ke tujuan awal" — dan pertahanan open
// redirect yang menyertainya.
//
// Nilai `tujuan` datang dari URL, dan URL datang dari siapa saja. Test di sini
// sebagian besar tentang yang HARUS DITOLAK, sebab jalur bahagianya sepele
// sedangkan jalur jahatnya tidak.
import { describe, expect, it } from "vitest";
import {
  bacaTujuan,
  bersihkanTujuan,
  rangkaiTujuan,
  tautanMasuk,
} from "../src/shared/rute/tujuan.js";

describe("tujuan internal diloloskan apa adanya", () => {
  it.each([
    ["/lamaran", "/lamaran"],
    ["/lamaran?halaman=2", "/lamaran?halaman=2"],
    ["/lamaran#bagian", "/lamaran#bagian"],
    ["/", "/"],
  ])("%s → %s", (masuk, harap) => {
    expect(bersihkanTujuan(masuk)).toBe(harap);
  });
});

describe("tujuan ke luar situs DITOLAK", () => {
  it.each([
    // Alamat yang dikirim orang lain, mengirim pengguna ke situs asing TEPAT
    // setelah ia berhasil masuk — saat ia paling percaya bahwa yang dilihatnya
    // adalah aplikasi ini.
    ["skema penuh", "https://jahat.example"],
    ["skema tanpa https", "http://jahat.example"],
    // Bentuk yang paling sering lolos dari pemeriksaan "diawali /": browser
    // membacanya sebagai host lain meski tidak ada skemanya.
    ["protocol-relative", "//jahat.example"],
    ["protocol-relative berjalur", "//jahat.example/masuk"],
    // Sebagian browser memperlakukan "\" seperti "/".
    ["garis miring terbalik", "/\\jahat.example"],
    ["javascript:", "javascript:alert(1)"],
    ["relatif", "lamaran"],
    ["kosong", ""],
  ])("%s ditolak → /", (_nama, jahat) => {
    expect(bersihkanTujuan(jahat)).toBe("/");
  });

  it("null dan undefined jatuh ke /", () => {
    expect(bersihkanTujuan(null)).toBe("/");
    expect(bersihkanTujuan(undefined)).toBe("/");
  });
});

describe("merangkai dan membaca kembali", () => {
  it("jalur, query, dan hash ikut terbawa", () => {
    expect(rangkaiTujuan({ pathname: "/lamaran", search: "?h=2", hash: "#atas" })).toBe(
      "/lamaran?h=2#atas",
    );
  });

  it("tautan masuk membawa tujuan yang ter-encode", () => {
    const tautan = tautanMasuk({ pathname: "/lamaran", search: "?h=2" });

    expect(tautan).toBe("/masuk?tujuan=%2Flamaran%3Fh%3D2");
    // Yang ditulis harus bisa dibaca kembali utuh — kalau tidak, pengguna
    // mendarat di tempat yang salah setelah masuk.
    expect(bacaTujuan(new URL(tautan, "http://x").search)).toBe("/lamaran?h=2");
  });

  it("tujuan '/' tidak ditulis sebagai parameter", () => {
    // Parameter yang tidak menambah apa pun hanya memanjangkan alamat —
    // termasuk bagi pengguna yang mendengarkan URL-nya dibacakan.
    expect(tautanMasuk({ pathname: "/" })).toBe("/masuk");
  });

  it("tujuan jahat yang sudah terlanjur ada di URL tetap dibersihkan saat dibaca", () => {
    // Pertahanan di sisi BACA, bukan hanya sisi tulis: URL-nya tidak pernah
    // kita yang membuat.
    expect(bacaTujuan("?tujuan=https%3A%2F%2Fjahat.example")).toBe("/");
    expect(bacaTujuan("?tujuan=%2F%2Fjahat.example")).toBe("/");
  });

  it("tanpa parameter sama sekali → /", () => {
    expect(bacaTujuan("")).toBe("/");
  });
});
