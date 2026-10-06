// Seam tujuan notifikasi (PR-050, AC-4).
//
// PR-079: halaman `/lamaran/:id` lahir, dan kabar lamaran pelamar kini
// mengantar ke sana — test "BELUM punya tujuan" di bawah berubah persis seperti
// yang diniatkan catatan asli ini. Penjaga "alamat belum ada" kini memeriksa
// langsung ke `ruteApp`: setiap tujuan harus cocok dengan route nyata.
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
import { matchRoutes } from "react-router";
import { ruteApp } from "../src/app/routes.js";
import { tautanNotifikasi } from "../src/features/notifikasi/tautan.js";

const PARAMS = {
  applicationId: "01912345-89ab-7def-8123-4567890abe01",
  jobId: "01912345-89ab-7def-8123-4567890abf01",
  status: "interview",
  resumeId: "01912345-89ab-7def-8123-4567890abf02",
  sessionId: "01912345-89ab-7def-8123-4567890abf03",
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

  it("kabar admin (PR-077b) mengantar ke detail lamaran admin", () => {
    for (const type of [
      NOTIFICATION_TYPE.ADMIN_LAMARAN_BARU,
      NOTIFICATION_TYPE.ADMIN_LAMARAN_DIBATALKAN,
      NOTIFICATION_TYPE.ADMIN_PENEMPATAN_TERKONFIRMASI,
    ]) {
      expect(tautanNotifikasi({ type, params: PARAMS })).toBe(
        `/admin/lamaran/${PARAMS.applicationId}`,
      );
    }
  });

  it("sambutan akun TIDAK punya tujuan, dan itu permanen", () => {
    // Satu-satunya tipe yang akan tetap tanpa tautan sesudah Phase 12: sambutan
    // tidak menunjuk entitas apa pun.
    expect(
      tautanNotifikasi({ type: NOTIFICATION_TYPE.AUTH_SELAMAT_DATANG, params: {} }),
    ).toBeNull();
  });

  it("kabar Community dapat dibaca sebelum halaman diskusi/antrean tersedia", () => {
    for (const type of [
      NOTIFICATION_TYPE.ADMIN_COMMUNITY_REPORT,
      NOTIFICATION_TYPE.COMMUNITY_CONTENT_MODERATED,
    ])
      expect(tautanNotifikasi({ type, params: {} })).toBeNull();
  });
  it.each(["post", "comment"])(
    "kabar moderasi %s membuka konten pemilik beserta konteks ruang",
    (targetType) => {
      const targetId = "01912345-89ab-7def-8123-4567890acd01";
      const communityId = "01912345-89ab-7def-8123-4567890acc01";
      const ke = tautanNotifikasi({
        type: NOTIFICATION_TYPE.COMMUNITY_CONTENT_MODERATED,
        params: { targetType, targetId, communityId },
      });
      expect(ke).toBe(`/community/content/${targetType}/${targetId}?room=${communityId}`);
      expect(matchRoutes(ruteApp, ke!)?.at(-1)?.route.path).not.toBe("*");
    },
  );

  it("kabar lamaran pelamar mengantar ke detail lamarannya (PR-079, AC-4 PR-050)", () => {
    for (const type of [
      NOTIFICATION_TYPE.LAMARAN_TERKIRIM,
      NOTIFICATION_TYPE.LAMARAN_STATUS_BERUBAH,
    ]) {
      expect(tautanNotifikasi({ type, params: PARAMS })).toBe(`/lamaran/${PARAMS.applicationId}`);
    }
  });

  it("notifikasi PDF membuka editor CV yang menghasilkan berkasnya", () => {
    expect(tautanNotifikasi({ type: NOTIFICATION_TYPE.RESUME_PDF_SIAP, params: PARAMS })).toBe(
      `/cv/${PARAMS.resumeId}`,
    );
  });

  it("draft CV dari AI: siap → editor draft-nya; gagal → halaman chat (transkrip + formulir)", () => {
    expect(tautanNotifikasi({ type: NOTIFICATION_TYPE.RESUME_DRAFT_AI_SIAP, params: PARAMS })).toBe(
      `/cv/${PARAMS.resumeId}`,
    );
    expect(
      tautanNotifikasi({ type: NOTIFICATION_TYPE.RESUME_DRAFT_AI_GAGAL, params: PARAMS }),
    ).toBe("/cv/chat");
  });

  it("tidak satu pun tipe menjanjikan alamat yang belum ada di router", () => {
    // Bentuk paling langsung dari alasan seam ini ada: setiap tujuan harus
    // cocok dengan route nyata, bukan jatuh ke penangkap `*` (404).
    for (const type of notificationTypeSchema.options) {
      const ke = tautanNotifikasi({ type, params: PARAMS });
      if (ke === null) continue;
      const cocok = matchRoutes(ruteApp, ke) ?? [];
      expect(cocok.at(-1)?.route.path, `${type} → ${ke}`).not.toBe("*");
      expect(cocok.length, `${type} → ${ke}`).toBeGreaterThan(0);
    }
  });
});
