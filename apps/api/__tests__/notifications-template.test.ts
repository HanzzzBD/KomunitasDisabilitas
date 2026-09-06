// Unit renderer template notifikasi (PR-047) — AC "Template kedua varian bahasa
// ter-render benar (snapshot)".
//
// SNAPSHOT DITULIS TANGAN, bukan `toMatchSnapshot()`. Snapshot otomatis
// menjawab pertanyaan "apakah kalimatnya berubah?"; yang perlu dijawab adalah
// "apakah kalimatnya benar?" — dan kalimat yang salah akan direkam apa adanya
// oleh snapshot otomatis lalu lulus selamanya. Kalimat yang ditulis di sini
// dibaca manusia saat review, dan itulah gunanya.
//
// Yang dijaga berkas ini melampaui kecocokan string: bahwa kedua varian ADA,
// bahwa varian sederhana bukan salinan mentah varian `id` (aturan yang sama
// dengan katalog web — docs/panduan-bahasa-sederhana.md), dan bahwa katalog
// template menutupi SELURUH tipe terdaftar.
import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_PARAM_SCHEMAS,
  notificationTypeSchema,
  type NotificationType,
} from "@nawasena/schemas";
import { LABEL_STATUS, renderNotifikasi, TEMPLATE } from "../src/modules/notifications/index.js";

const APPLICATION = "018f4c1e-0000-7000-8000-0000000a0001";
const JOB = "018f4c1e-0000-7000-8000-0000000b0001";

/**
 * Entri yang varian `id-simple`-nya BOLEH sama dengan `id`, beserta alasannya.
 *
 * Bentuknya meniru `SAMA_DENGAN_SENGAJA` di katalog web dengan sengaja: menyalin
 * `id` ke `id-simple` adalah cara termudah membuat katalog terasa lengkap tanpa
 * menulis varian sederhananya, dan tipe tidak bisa membedakan salinan malas dari
 * kalimat yang memang sudah sesederhana mungkin. Yang bisa membedakan hanya
 * manusia — jadi penjaganya memaksa manusia itu menuliskan keputusannya.
 *
 * Kosong hari ini: ketiga template punya varian sederhana yang benar-benar
 * berbeda. Dibiarkan ada supaya PR berikutnya punya tempat menaruh keputusannya,
 * bukan alasan melonggarkan penjaganya.
 */
const SAMA_DENGAN_SENGAJA: Partial<Record<string, string>> = {};

describe("template notifikasi — snapshot kedua varian", () => {
  it("auth.selamat_datang", () => {
    expect(renderNotifikasi("auth.selamat_datang", {})).toEqual({
      title: {
        id: "Selamat datang di Nawasena",
        "id-simple": "Selamat datang, senang Anda di sini",
      },
      body: {
        id: "Lengkapi profil Anda agar lowongan yang cocok bisa kami tampilkan.",
        "id-simple": "Isi profil Anda dulu. Setelah itu kami tunjukkan kerja yang cocok.",
      },
    });
  });

  it("lamaran.terkirim", () => {
    expect(
      renderNotifikasi("lamaran.terkirim", { applicationId: APPLICATION, jobId: JOB }),
    ).toEqual({
      title: {
        id: "Lamaran Anda terkirim",
        "id-simple": "Lamaran Anda sudah dikirim",
      },
      body: {
        id: "Perusahaan akan meninjau lamaran Anda. Anda kami kabari bila statusnya berubah.",
        "id-simple":
          "Perusahaan akan membaca lamaran Anda. Anda tidak perlu mengirim ulang. Kami kabari kalau ada kabar baru.",
      },
    });
  });

  it("lamaran.status_berubah — status disebut sebagai label manusia", () => {
    const hasil = renderNotifikasi("lamaran.status_berubah", {
      applicationId: APPLICATION,
      jobId: JOB,
      status: "interview",
    });

    expect(hasil).toEqual({
      title: {
        id: "Status lamaran: Undangan wawancara",
        "id-simple": "Kabar lamaran Anda: Anda diundang wawancara",
      },
      body: {
        id: 'Lamaran Anda kini berstatus "Undangan wawancara". Buka rincian lamaran untuk melihat langkah berikutnya.',
        "id-simple": "Anda diundang wawancara. Buka lamaran Anda untuk tahu langkah berikutnya.",
      },
    });
  });

  it("nilai enum status TIDAK pernah bocor ke kalimat", () => {
    // `in_review` yang lolos apa adanya akan dibacakan screen reader sebagai
    // "in underscore review" — istilah mesin di telinga pengguna.
    for (const status of Object.keys(LABEL_STATUS)) {
      const teks = renderNotifikasi("lamaran.status_berubah", {
        applicationId: APPLICATION,
        jobId: JOB,
        status: status as keyof typeof LABEL_STATUS,
      });
      const semua = [teks.title.id, teks.title["id-simple"], teks.body.id, teks.body["id-simple"]];
      for (const kalimat of semua) {
        expect(kalimat).not.toContain(status);
        expect(kalimat).not.toContain("_");
      }
    }
  });
});

describe("kelengkapan katalog template", () => {
  const semuaTipe = notificationTypeSchema.options as readonly NotificationType[];

  it("setiap tipe terdaftar punya template DAN skema parameter", () => {
    for (const tipe of semuaTipe) {
      expect(TEMPLATE[tipe], `template ${tipe}`).toBeDefined();
      expect(NOTIFICATION_PARAM_SCHEMAS[tipe], `skema parameter ${tipe}`).toBeDefined();
    }
    // Kebalikannya juga: template untuk tipe yang tidak terdaftar adalah kode
    // mati yang tampak hidup.
    expect(Object.keys(TEMPLATE).sort()).toEqual([...semuaTipe].sort());
  });

  it("setiap label status lamaran punya kedua varian, tidak kosong", () => {
    for (const [status, label] of Object.entries(LABEL_STATUS)) {
      expect(label.id.length, `${status}.id`).toBeGreaterThan(0);
      expect(label["id-simple"].length, `${status}.id-simple`).toBeGreaterThan(0);
    }
  });

  it("varian id-simple bukan salinan mentah varian id (kecuali yang didaftarkan)", () => {
    const kembar: string[] = [];

    const periksa = (kunci: string, teks: { id: string; "id-simple": string }) => {
      if (teks.id === teks["id-simple"] && SAMA_DENGAN_SENGAJA[kunci] === undefined) {
        kembar.push(kunci);
      }
    };

    for (const [status, label] of Object.entries(LABEL_STATUS)) {
      periksa(`status.${status}`, label);
    }
    periksa("auth.selamat_datang.title", renderNotifikasi("auth.selamat_datang", {}).title);
    periksa("auth.selamat_datang.body", renderNotifikasi("auth.selamat_datang", {}).body);

    const terkirim = renderNotifikasi("lamaran.terkirim", {
      applicationId: APPLICATION,
      jobId: JOB,
    });
    periksa("lamaran.terkirim.title", terkirim.title);
    periksa("lamaran.terkirim.body", terkirim.body);

    expect(
      kembar,
      "varian id-simple identik dengan id — tulis varian sederhananya, atau daftarkan alasannya di SAMA_DENGAN_SENGAJA",
    ).toEqual([]);
  });
});
