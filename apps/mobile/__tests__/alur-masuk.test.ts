// Logika layar masuk (PR-090): normalisasi nomor, kode OTP, pesan galat, dan
// alur Google (nonce → Credential Manager → tukar).
import { ApiError } from "@nawasena/api-client";
import { phoneNumberSchema } from "@nawasena/schemas";
import { describe, expect, it, vi } from "vitest";

import {
  formatHitungMundur,
  galatJaringan,
  normalisasiNomor,
  pesanGalat,
  rapikanKode,
} from "../src/auth/alur-masuk";
import { masukDenganGoogle, serverClientIdGoogle, type DepsGoogle } from "../src/auth/google";

describe("normalisasiNomor", () => {
  it.each([
    ["0812 3456 7890", "+6281234567890"],
    ["0812-3456-7890", "+6281234567890"],
    ["62812 3456 7890", "+6281234567890"],
    ["+62 812-3456-7890", "+6281234567890"],
    ["812 3456 7890", "+6281234567890"],
  ])("%s → %s (lolos skema)", (ketikan, hasil) => {
    expect(normalisasiNomor(ketikan)).toBe(hasil);
    expect(phoneNumberSchema.safeParse(hasil).success).toBe(true);
  });

  it("ketikan acak tidak dipaksa jadi nomor sah", () => {
    expect(phoneNumberSchema.safeParse(normalisasiNomor("halo")).success).toBe(false);
  });
});

describe("rapikanKode", () => {
  it("hanya angka, maksimal 6 (termasuk hasil autofill berspasi)", () => {
    expect(rapikanKode("48 29 13")).toBe("482913");
    expect(rapikanKode("Kode: 4829137")).toBe("482913");
    expect(rapikanKode("abc")).toBe("");
  });
});

describe("pesanGalat & galatJaringan", () => {
  it("ApiError → pesan + saran dari server", () => {
    const err = new ApiError({ code: "X", message: "Kode salah", hint: "Coba lagi" }, 401);
    expect(pesanGalat(err)).toBe("Kode salah. Coba lagi");
    expect(galatJaringan(err)).toBe(false);
  });

  it("galat lain → pesan umum, tanpa detail teknis", () => {
    expect(pesanGalat(new Error("TypeError: x is undefined"))).toBe(
      "Terjadi kesalahan. Coba lagi.",
    );
  });

  it("status 0 = jaringan", () => {
    expect(galatJaringan(new ApiError({ code: "JARINGAN_GAGAL", message: "m" }, 0))).toBe(true);
  });
});

describe("formatHitungMundur", () => {
  it.each([
    [75, "1:15"],
    [9, "0:09"],
    [0, "0:00"],
    [-3, "0:00"],
  ])("%i → %s", (detik, teks) => expect(formatHitungMundur(detik)).toBe(teks));
});

const SESI = { accessToken: "at", expiresIn: 900, refreshToken: "rt" };
const CLIENT = "123-web.apps.googleusercontent.com";

function deps(ubah: Partial<DepsGoogle> = {}): DepsGoogle {
  return {
    serverClientId: CLIENT,
    mintaNonce: vi.fn(async () => "nonce-server"),
    pilihAkun: vi.fn(async () => "id-token"),
    tukar: vi.fn(async () => SESI),
    ...ubah,
  };
}

const galatNative = (code: string) => Object.assign(new Error(code), { code });

describe("masukDenganGoogle", () => {
  it("nonce server diteruskan ke Credential Manager, id_token ditukar jadi sesi", async () => {
    const d = deps();
    expect(await masukDenganGoogle(d)).toEqual({ ok: true, tokens: SESI });
    expect(d.pilihAkun).toHaveBeenCalledWith(CLIENT, "nonce-server");
    expect(d.tukar).toHaveBeenCalledWith("id-token");
  });

  it("pengguna menutup pemilih akun → dibatalkan, tanpa pesan galat dan tanpa tukar", async () => {
    const d = deps({ pilihAkun: vi.fn(async () => Promise.reject(galatNative("DIBATALKAN"))) });
    expect(await masukDenganGoogle(d)).toEqual({ ok: false, sebab: "dibatalkan" });
    expect(d.tukar).not.toHaveBeenCalled();
  });

  it("tidak ada akun Google → arahan menambah akun atau memakai nomor HP", async () => {
    const hasil = await masukDenganGoogle(
      deps({ pilihAkun: vi.fn(async () => Promise.reject(galatNative("TIDAK_ADA_AKUN"))) }),
    );
    expect(hasil).toMatchObject({ ok: false, sebab: "galat" });
    expect(hasil.ok === false && hasil.sebab === "galat" && hasil.pesan).toMatch(/nomor HP/);
  });

  it("server menolak id_token → pesan server diteruskan", async () => {
    const tolak = new ApiError({ code: "TOKEN_GOOGLE_TIDAK_VALID", message: "Tidak sah" }, 401);
    const hasil = await masukDenganGoogle(
      deps({ tukar: vi.fn(async () => Promise.reject(tolak)) }),
    );
    expect(hasil).toEqual({ ok: false, sebab: "galat", pesan: "Tidak sah" });
  });

  it("gagal meminta nonce → galat, Credential Manager tidak dibuka", async () => {
    const d = deps({
      mintaNonce: vi.fn(async () =>
        Promise.reject(new ApiError({ code: "BELUM_SIAP", message: "Belum tersedia" }, 503)),
      ),
    });
    expect(await masukDenganGoogle(d)).toEqual({
      ok: false,
      sebab: "galat",
      pesan: "Belum tersedia",
    });
    expect(d.pilihAkun).not.toHaveBeenCalled();
  });
});

describe("serverClientIdGoogle", () => {
  it("hanya menerima Web Client ID berbentuk sah; kosong = tombol disembunyikan", () => {
    expect(serverClientIdGoogle(` ${CLIENT} `)).toBe(CLIENT);
    expect(serverClientIdGoogle("")).toBeNull();
    expect(serverClientIdGoogle(undefined)).toBeNull();
    expect(serverClientIdGoogle("bukan-client-id")).toBeNull();
  });
});
