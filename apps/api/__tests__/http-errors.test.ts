import { describe, it, expect, vi } from "vitest";
import { errorCodeSchema } from "@nawasena/schemas";
import { ERROR_CATALOG, AppError, appError } from "../src/core/http/errors.js";
import { asyncHandler } from "../src/core/http/async-handler.js";
import type { NextFunction, Request, Response } from "express";

describe("katalog kode error (AC: message Bahasa Indonesia sederhana)", () => {
  const entries = Object.entries(ERROR_CATALOG);

  it("semua kode lolos konvensi errorCodeSchema (UPPER_SNAKE_CASE)", () => {
    for (const [code] of entries) {
      expect(errorCodeSchema.safeParse(code).success, `kode tidak valid: ${code}`).toBe(true);
    }
  });

  it("semua entry punya status HTTP valid + message + hint terisi", () => {
    for (const [code, entry] of entries) {
      expect(entry.status, code).toBeGreaterThanOrEqual(400);
      expect(entry.status, code).toBeLessThanOrEqual(599);
      expect(entry.message.length, code).toBeGreaterThan(0);
      expect(entry.hint?.length ?? 0, `${code} tanpa hint`).toBeGreaterThan(0);
    }
  });

  it("katalog ter-snapshot — perubahan pesan selalu terlihat di review", () => {
    expect(ERROR_CATALOG).toMatchInlineSnapshot(`
      {
        "ALASAN_AKSES_DIPERLUKAN": {
          "hint": "Tulis alasan singkat (maksimal 200 karakter), lalu ulangi permintaan",
          "message": "Akses data disabilitas harus menyertakan alasan",
          "status": 403,
        },
        "BELUM_SIAP": {
          "hint": "Tunggu sebentar, lalu coba lagi",
          "message": "Layanan sedang tidak siap",
          "status": 503,
        },
        "CARA_KONFIRMASI_TIDAK_COCOK": {
          "hint": "Gunakan cara konfirmasi yang tersedia untuk akun Anda",
          "message": "Cara konfirmasi itu tidak bisa dipakai untuk akun Anda",
          "status": 400,
        },
        "CONSENT_SENSITIF_DIPERLUKAN": {
          "hint": "Centang dulu persetujuan penyimpanan data disabilitas, lalu simpan lagi",
          "message": "Kami belum boleh menyimpan data disabilitas Anda",
          "status": 403,
        },
        "EMAIL_GOOGLE_BELUM_TERVERIFIKASI": {
          "hint": "Verifikasi email di akun Google Anda, lalu coba lagi — atau masuk dengan kode OTP",
          "message": "Email Google Anda belum terverifikasi",
          "status": 403,
        },
        "EMAIL_GOOGLE_DIKLAIM_AKUN_LAIN": {
          "hint": "Masuk dengan kode OTP memakai nomor HP Anda; hubungi kami bila Anda tidak mengenali akun itu",
          "message": "Email Google Anda sudah terdaftar lewat cara lain",
          "status": 409,
        },
        "EMAIL_TIDAK_BISA_DIPAKAI": {
          "hint": "Coba email lain, atau masuk dengan email tersebut bila itu milik Anda",
          "message": "Email ini tidak bisa dipakai",
          "status": 409,
        },
        "GOOGLE_EXCHANGE_GAGAL": {
          "hint": "Ulangi dari tombol Masuk dengan Google; tautan masuk hanya berlaku sekali",
          "message": "Masuk dengan Google tidak berhasil",
          "status": 401,
        },
        "JSON_TIDAK_VALID": {
          "hint": "Coba ulangi; laporkan bila terus terjadi",
          "message": "Format data yang dikirim rusak",
          "status": 400,
        },
        "KODE_OTP_HANGUS": {
          "hint": "Minta kode baru, lalu masukkan dalam 5 menit",
          "message": "Kode sudah tidak berlaku",
          "status": 410,
        },
        "KODE_OTP_SALAH": {
          "hint": "Periksa kembali kode dari WhatsApp atau SMS",
          "message": "Kode yang Anda masukkan salah",
          "status": 401,
        },
        "KONFIRMASI_GOOGLE_BEDA_AKUN": {
          "hint": "Ulangi dan pilih akun Google yang Anda pakai untuk masuk ke Nawasena",
          "message": "Akun Google yang Anda pakai berbeda dengan akun ini",
          "status": 403,
        },
        "KONFIRMASI_TIDAK_TERSEDIA": {
          "hint": "Coba lagi beberapa saat, atau hubungi kami untuk dibantu menghapus akun",
          "message": "Kami belum bisa memastikan identitas Anda saat ini",
          "status": 503,
        },
        "KUOTA_AI_HABIS": {
          "hint": "Coba lagi besok, atau lanjutkan tanpa bantuan AI",
          "message": "Jatah bantuan AI Anda hari ini sudah habis",
          "status": 429,
        },
        "RUTE_TIDAK_DITEMUKAN": {
          "hint": "Periksa kembali alamat yang Anda tuju",
          "message": "Halaman atau data tidak ditemukan",
          "status": 404,
        },
        "SESI_TIDAK_VALID": {
          "hint": "Silakan masuk lagi untuk melanjutkan",
          "message": "Sesi Anda sudah berakhir",
          "status": 401,
        },
        "TERJADI_KESALAHAN": {
          "hint": "Coba lagi beberapa saat; laporkan bila terus terjadi",
          "message": "Terjadi kesalahan pada server",
          "status": 500,
        },
        "TERLALU_BANYAK_PERCOBAAN": {
          "hint": "Tunggu sesuai waktu yang diberitahukan, lalu minta kode baru",
          "message": "Terlalu banyak percobaan kode",
          "status": 429,
        },
        "TERLALU_BANYAK_PERMINTAAN": {
          "hint": "Tunggu sebentar, lalu coba lagi",
          "message": "Terlalu banyak permintaan",
          "status": 429,
        },
        "TIDAK_BERHAK": {
          "hint": "Hubungi admin bila Anda merasa seharusnya punya akses",
          "message": "Anda tidak berhak mengakses ini",
          "status": 403,
        },
        "TIDAK_TERAUTENTIKASI": {
          "hint": "Silakan masuk terlebih dahulu",
          "message": "Anda belum masuk",
          "status": 401,
        },
        "TOKEN_GOOGLE_TIDAK_VALID": {
          "hint": "Ulangi dari tombol Masuk dengan Google",
          "message": "Data masuk dari Google tidak sah",
          "status": 401,
        },
        "VALIDATION_ERROR": {
          "hint": "Periksa kembali data yang Anda isi",
          "message": "Input tidak valid",
          "status": 400,
        },
      }
    `);
  });

  it("AppError: kode → status/message/hint dari katalog; override hint bekerja", () => {
    const err = appError("TIDAK_BERHAK");
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
    expect(err.envelope).toEqual({
      code: "TIDAK_BERHAK",
      message: "Anda tidak berhak mengakses ini",
      hint: "Hubungi admin bila Anda merasa seharusnya punya akses",
    });
    expect(appError("VALIDATION_ERROR", { hint: "phone: wajib +62" }).hint).toBe(
      "phone: wajib +62",
    );
  });
});

describe("asyncHandler", () => {
  it("rejection handler async diteruskan ke next(err)", async () => {
    const boom = new Error("meledak");
    const handler = asyncHandler(async () => {
      throw boom;
    });
    const next = vi.fn();
    handler({} as Request, {} as Response, next as NextFunction);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(boom));
  });
});
