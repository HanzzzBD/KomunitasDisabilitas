// Seam tujuan notifikasi (PR-050, AC-4).
//
// BERKAS INI MENJAGA SEBUAH KETIADAAN, dan itu bentuk test yang paling mudah
// disalahpahami — jadi alasannya ditulis di sini, bukan hanya di kode.
//
// AC-4 berbunyi "navigasi dari notifikasi ke entitas terkait (lamaran)".
// Entitas itu belum punya halaman: modul `applications` lahir di Phase 12, dan
// tidak ada route `/lamaran/:id` di `app/routes.ts`. Merender tautan ke alamat
// yang tidak ada berarti mengantar pengguna ke layar 404 dari kabar yang justru
// ingin ia tindak lanjuti — "belum bisa" berubah menjadi "rusak".
//
// Yang dibangun karena itu SEAM-nya. Test ini mengunci dua hal sekaligus:
// (1) hari ini tidak ada tautan yang menjanjikan halaman yang tak ada, dan
// (2) begitu Phase 12 mengubah SATU fungsi, test ini akan MERAH — sehingga
// perubahannya tidak bisa terjadi tanpa seseorang membaca kembali keputusan di
// atas dan memperbarui AC-nya.
import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPE, notificationTypeSchema } from "@nawasena/schemas";
import { tautanNotifikasi } from "../src/features/notifikasi/tautan.js";

const PARAMS = {
  applicationId: "01912345-89ab-7def-8123-4567890abe01",
  jobId: "01912345-89ab-7def-8123-4567890abf01",
  status: "interview",
  resumeId: "01912345-89ab-7def-8123-4567890abf02",
};

describe("tujuan notifikasi", () => {
  it("SETIAP tipe terdaftar punya jawaban — tidak ada yang melempar", () => {
    // Ini yang membuat `switch` ber-`never` di `tautan.ts` berarti sesuatu:
    // tipe baru yang lupa diputuskan tujuannya akan meledak di sini, bukan di
    // layar pengguna.
    for (const type of notificationTypeSchema.options) {
      expect(() => tautanNotifikasi({ type, params: PARAMS })).not.toThrow();
    }
  });

  it("sambutan akun TIDAK punya tujuan, dan itu permanen", () => {
    // Satu-satunya tipe yang akan tetap tanpa tautan sesudah Phase 12: sambutan
    // tidak menunjuk entitas apa pun.
    expect(
      tautanNotifikasi({ type: NOTIFICATION_TYPE.AUTH_SELAMAT_DATANG, params: {} }),
    ).toBeNull();
  });

  it("notifikasi lamaran BELUM punya tujuan — halamannya lahir di Phase 12", () => {
    // MERAH begitu `/lamaran/:id` dipasang dan `tautan.ts` diperbarui. Itu
    // memang yang diinginkan: perubahan tujuan navigasi tidak boleh lolos tanpa
    // seseorang meninjau ulang AC-4.
    expect(tautanNotifikasi({ type: NOTIFICATION_TYPE.LAMARAN_TERKIRIM, params: PARAMS })).toBeNull();
    expect(
      tautanNotifikasi({ type: NOTIFICATION_TYPE.LAMARAN_STATUS_BERUBAH, params: PARAMS }),
    ).toBeNull();
  });

  it("notifikasi PDF membuka editor CV yang menghasilkan berkasnya", () => {
    expect(
      tautanNotifikasi({ type: NOTIFICATION_TYPE.RESUME_PDF_SIAP, params: PARAMS }),
    ).toBe(`/cv/${PARAMS.resumeId}`);
  });

  it("tidak satu pun tipe menjanjikan alamat yang belum ada di router", () => {
    // Bentuk paling langsung dari alasan seam ini ada.
    for (const type of notificationTypeSchema.options) {
      const ke = tautanNotifikasi({ type, params: PARAMS });
      // `null` LULUS: tidak menjanjikan apa pun memang jawaban yang benar hari
      // ini. Yang tidak boleh adalah string yang menunjuk alamat tak terpasang.
      if (ke !== null) expect(ke).not.toMatch(/^\/lamaran\//);
    }
  });
});
