// PKCE (PR-030c) — RFC 7636.
//
// Seluruh guna PKCE adalah nilai yang tidak bisa ditebak dan sidik jari yang
// tidak bisa dibalik. Keduanya jenis kesalahan yang TIDAK bergejala: alur yang
// memakai `Math.random()` atau metode `plain` berjalan mulus dan tetap
// menerima pengguna masuk. Karena itu diuji terhadap vektor resmi, bukan
// terhadap "apakah menghasilkan sesuatu".
import { describe, expect, it } from "vitest";
import { buatChallenge, buatState, buatVerifier } from "../src/features/auth/pkce.js";
import { pkceCodeVerifierSchema } from "@nawasena/schemas";

describe("code_verifier memenuhi skema bersama", () => {
  it("lolos skema yang sama dengan yang dipakai server", () => {
    // Bukan regex kedua di test: verifier yang lolos di sini tetapi ditolak
    // server menghasilkan kegagalan yang hanya muncul di produksi.
    for (let i = 0; i < 20; i += 1) {
      expect(pkceCodeVerifierSchema.safeParse(buatVerifier()).success).toBe(true);
    }
  });

  it("panjangnya di dalam rentang RFC (43–128)", () => {
    const v = buatVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it("hanya memakai karakter unreserved", () => {
    expect(buatVerifier()).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });
});

describe("nilainya tidak boleh berulang", () => {
  it("dua verifier berturut-turut berbeda", () => {
    const kumpulan = new Set(Array.from({ length: 50 }, () => buatVerifier()));
    expect(kumpulan.size).toBe(50);
  });

  it("dua state berturut-turut berbeda", () => {
    const kumpulan = new Set(Array.from({ length: 50 }, () => buatState()));
    expect(kumpulan.size).toBe(50);
  });

  it("sebarannya tidak terkunci pada segelintir karakter", () => {
    // Penjaga kasar terhadap generator yang rusak (mis. selalu mengembalikan
    // byte yang sama). Bukan uji statistik — hanya memastikan keluarannya tidak
    // sesempit satu-dua karakter.
    const gabungan = Array.from({ length: 20 }, () => buatVerifier()).join("");
    expect(new Set(gabungan).size).toBeGreaterThan(30);
  });
});

describe("code_challenge memakai S256, bukan plain", () => {
  it("cocok dengan vektor resmi RFC 7636 Lampiran B", async () => {
    // Inilah yang membuktikan metodenya benar-benar SHA-256 + base64url tanpa
    // padding — bukan sekadar "menghasilkan string".
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const harap = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    expect(await buatChallenge(verifier)).toBe(harap);
  });

  it("challenge BUKAN verifier apa adanya", async () => {
    // Metode `plain` juga sah menurut RFC dan tidak melindungi apa pun:
    // penyerang yang bisa membaca permintaan pertama sudah memegang verifier.
    const v = buatVerifier();
    expect(await buatChallenge(v)).not.toBe(v);
  });

  it("tanpa padding dan aman untuk URL", async () => {
    const hasil = await buatChallenge(buatVerifier());
    expect(hasil).not.toContain("=");
    expect(hasil).not.toContain("+");
    expect(hasil).not.toContain("/");
  });

  it("verifier yang sama selalu menghasilkan challenge yang sama", async () => {
    const v = buatVerifier();
    expect(await buatChallenge(v)).toBe(await buatChallenge(v));
  });
});
