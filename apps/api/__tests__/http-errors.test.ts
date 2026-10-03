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
        "AI_ALIRAN_TIDAK_ADA": {
          "hint": "Muat ulang percakapan untuk melihat jawaban yang sudah tersimpan",
          "message": "Jawaban ini sudah tidak bisa disambung lagi",
          "status": 404,
        },
        "AI_CHAT_DIMATIKAN": {
          "hint": "Anda tetap bisa membuat CV lewat formulir biasa",
          "message": "Chat AI sedang tidak tersedia",
          "status": 503,
        },
        "AI_CHAT_SIBUK": {
          "hint": "Coba lagi sebentar lagi, atau lanjutkan lewat formulir CV biasa",
          "message": "Chat AI sedang ramai",
          "status": 503,
        },
        "AI_SEDANG_MENJAWAB": {
          "hint": "Tunggu jawabannya selesai, lalu kirim pesan berikutnya",
          "message": "Pewawancara masih menjawab pesan sebelumnya",
          "status": 409,
        },
        "AI_SESI_KOSONG": {
          "hint": "Jawab beberapa pertanyaan dulu, atau isi CV lewat formulir biasa",
          "message": "Percakapan ini belum berisi jawaban Anda",
          "status": 409,
        },
        "AI_SESI_SEDANG_DIFINALISASI": {
          "hint": "Tunggu sebentar. Anda akan diberi tahu saat draft siap",
          "message": "Draft CV sedang dibuat dari percakapan ini",
          "status": 409,
        },
        "AI_SESI_SUDAH_SELESAI": {
          "hint": "Buka draft CV Anda untuk memeriksanya, atau mulai percakapan baru",
          "message": "Percakapan ini sudah selesai",
          "status": 409,
        },
        "AI_SESI_TIDAK_DITEMUKAN": {
          "hint": "Mungkin sudah lewat 30 hari dan dihapus. Mulai percakapan baru, atau isi formulir CV",
          "message": "Percakapan tidak ditemukan",
          "status": 404,
        },
        "AI_TRANSKRIP_PENUH": {
          "hint": "Selesaikan percakapan untuk membuat draft CV, lalu lengkapi lewat formulir",
          "message": "Percakapan ini sudah terlalu panjang",
          "status": 409,
        },
        "AKOMODASI_LOWONGAN_KOSONG": {
          "hint": "Tambahkan minimal satu akomodasi lewat PUT sebelum menerbitkan lowongan",
          "message": "Lowongan ini belum mencantumkan akomodasi apa pun",
          "status": 422,
        },
        "AKUN_DITANGGUHKAN": {
          "hint": "Hubungi tim Nawasena bila menurut Anda ini keliru",
          "message": "Akun Anda sedang ditangguhkan",
          "status": 403,
        },
        "ALASAN_AKSES_DIPERLUKAN": {
          "hint": "Tulis alasan singkat (maksimal 200 karakter), lalu ulangi permintaan",
          "message": "Akses data disabilitas harus menyertakan alasan",
          "status": 403,
        },
        "BATAS_CV_TERCAPAI": {
          "hint": "Hapus salah satu CV lama sebelum membuat yang baru",
          "message": "Jumlah CV Anda sudah mencapai batas",
          "status": 409,
        },
        "BELUM_SIAP": {
          "hint": "Tunggu sebentar, lalu coba lagi",
          "message": "Layanan sedang tidak siap",
          "status": 503,
        },
        "BERKAS_VIDEO_ISYARAT_TIDAK_ADA": {
          "hint": "Unggah ulang berkasnya, lalu tunggu sampai selesai 100%",
          "message": "Berkas belum sampai di penyimpanan",
          "status": 422,
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
        "CV_DIPAKAI_LAMARAN": {
          "hint": "Buat CV baru bila ingin mengubah isinya, atau ubah CV ini tanpa menghapusnya",
          "message": "CV ini sedang dipakai pada lamaran yang sudah Anda kirim",
          "status": 409,
        },
        "CV_TIDAK_DITEMUKAN": {
          "hint": "Mungkin sudah dihapus. Muat ulang daftar CV Anda, lalu coba lagi",
          "message": "CV tidak ditemukan",
          "status": 404,
        },
        "DATA_DISABILITAS_KOSONG": {
          "hint": "Isi data disabilitas di profil Anda, atau lamar tanpa mengirimnya",
          "message": "Belum ada data disabilitas untuk dikirim",
          "status": 422,
        },
        "DATA_TIDAK_DIUNGKAP": {
          "hint": "Hormati pilihan pelamar; teruskan lamaran tanpa data tersebut",
          "message": "Pelamar memilih tidak mengungkap data disabilitas pada lamaran ini",
          "status": 404,
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
        "IDEMPOTENCY_KEY_BENTROK": {
          "hint": "Muat ulang halaman, lalu coba lamar lagi",
          "message": "Permintaan ini bentrok dengan lamaran lain",
          "status": 422,
        },
        "IDEMPOTENCY_KEY_DIPERLUKAN": {
          "hint": "Muat ulang halaman, lalu coba lamar lagi",
          "message": "Permintaan melamar tidak lengkap",
          "status": 400,
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
        "LAMARAN_SEDANG_DIPROSES": {
          "hint": "Tunggu sebentar. Anda tidak perlu menekan tombol lagi",
          "message": "Lamaran Anda sedang dikirim",
          "status": 409,
        },
        "LAMARAN_TIDAK_DITEMUKAN": {
          "hint": "Muat ulang daftar lamaran Anda, lalu coba lagi",
          "message": "Lamaran tidak ditemukan",
          "status": 404,
        },
        "LOWONGAN_BERLAMARAN_TIDAK_BISA_DIHAPUS": {
          "hint": "Tutup lowongan (status closed) sebagai gantinya",
          "message": "Lowongan ini sudah punya pelamar dan tidak bisa dihapus",
          "status": 409,
        },
        "LOWONGAN_TIDAK_DITEMUKAN": {
          "hint": "Periksa kembali tautan atau ID lowongan",
          "message": "Lowongan tidak ditemukan",
          "status": 404,
        },
        "MEDIA_VIDEO_ISYARAT_TIDAK_VALID": {
          "hint": "Unggah ulang berkasnya lewat halaman kamus, lalu simpan lagi",
          "message": "Berkas media tidak cocok untuk video isyarat ini",
          "status": 422,
        },
        "PENGGUNA_TIDAK_BISA_DIMODERASI": {
          "hint": "Hanya akun pencari kerja yang bisa ditangguhkan",
          "message": "Akun ini tidak bisa ditangguhkan",
          "status": 422,
        },
        "PENGGUNA_TIDAK_DITEMUKAN": {
          "hint": "Muat ulang daftar pengguna, lalu coba lagi",
          "message": "Pengguna tidak ditemukan",
          "status": 404,
        },
        "PERUSAHAAN_TIDAK_DITEMUKAN": {
          "hint": "Periksa kembali tautan atau ID perusahaan",
          "message": "Perusahaan tidak ditemukan",
          "status": 404,
        },
        "RUTE_TIDAK_DITEMUKAN": {
          "hint": "Periksa kembali alamat yang Anda tuju",
          "message": "Halaman atau data tidak ditemukan",
          "status": 404,
        },
        "SESI_SUDAH_DIROTASI": {
          "hint": "Coba lagi sebentar",
          "message": "Sesi Anda sedang diperbarui",
          "status": 401,
        },
        "SESI_TIDAK_VALID": {
          "hint": "Silakan masuk lagi untuk melanjutkan",
          "message": "Sesi Anda sudah berakhir",
          "status": 401,
        },
        "STATUS_LAMARAN_TIDAK_VALID": {
          "hint": "Muat ulang lamaran untuk melihat statusnya yang terbaru",
          "message": "Lamaran ini tidak bisa diubah dari statusnya sekarang",
          "status": 409,
        },
        "STATUS_PENGGUNA_TIDAK_BERUBAH": {
          "hint": "Muat ulang daftar pengguna untuk melihat status terbaru",
          "message": "Status akun ini sudah berubah",
          "status": 409,
        },
        "SUDAH_MELAMAR": {
          "hint": "Lihat status lamaran Anda di halaman Lamaran Saya",
          "message": "Anda sudah melamar lowongan ini",
          "status": 409,
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
        "TRANSISI_STATUS_TIDAK_VALID": {
          "hint": "Periksa kembali status lowongan ini sebelum mencoba lagi",
          "message": "Lowongan tidak bisa berpindah ke status itu dari status saat ini",
          "status": 409,
        },
        "VALIDATION_ERROR": {
          "hint": "Periksa kembali data yang Anda isi",
          "message": "Input tidak valid",
          "status": 400,
        },
        "VIDEO_ISYARAT_BELUM_LENGKAP": {
          "hint": "Lengkapi video, caption (.vtt), dan transkrip terlebih dahulu",
          "message": "Video isyarat ini belum lengkap untuk diterbitkan",
          "status": 422,
        },
        "VIDEO_ISYARAT_BELUM_TERBIT": {
          "hint": "Muat ulang daftar kamus untuk melihat status terbaru",
          "message": "Video isyarat ini belum diterbitkan",
          "status": 409,
        },
        "VIDEO_ISYARAT_SUDAH_TERBIT": {
          "hint": "Muat ulang daftar kamus untuk melihat status terbaru",
          "message": "Video isyarat ini sudah diterbitkan",
          "status": 409,
        },
        "VIDEO_ISYARAT_TIDAK_DITEMUKAN": {
          "hint": "Muat ulang daftar kamus, lalu coba lagi",
          "message": "Video isyarat tidak ditemukan",
          "status": 404,
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
