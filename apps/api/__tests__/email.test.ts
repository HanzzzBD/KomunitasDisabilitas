// Unit pengiriman kabar email (PR-049a) — AC-1, AC-3, AC-5.
//
// Yang dijaga berkas ini, dan alasannya masing-masing:
//
//   AC-1  kabar terkirim lewat kanal email (Resend ditiru)
//   AC-3  kabar pasca-hapus TIDAK tunduk pada preferensi kanal — ia satu-
//         satunya kanal penerimanya (gerbang U-02)
//   AC-5  kedua varian bahasa terkirim sesuai preferensi pemiliknya (ADR-008)
//
// Ditambah keadaan-keadaan yang TIDAK boleh menjadi kegagalan job: seluruhnya
// tidak akan membaik bila diulang, dan DLQ yang berisi hal-hal yang tidak bisa
// diperbaiki siapa pun adalah DLQ yang berhenti dibaca orang.
import { describe, it, expect, vi } from "vitest";
import { notifyEmailJobSchema } from "@nawasena/schemas";
import {
  createEmailService,
  EmailError,
  type EmailSender,
  type HasilKirimEmail,
  type PesanEmail,
} from "../src/modules/notifications/index.js";

const USER = "018f4c1e-0000-7000-8000-00000000aaaa";
const ALAMAT = "orang@contoh.id";

const JOB = { jenis: "akun_dihapus", userId: USER } as const;

interface Opsi {
  baris?: { email: string | null; emailVerified: boolean } | null;
  jawab?: (pesan: PesanEmail) => HasilKirimEmail | Promise<HasilKirimEmail>;
  tersedia?: boolean;
  simpleLanguage?: boolean | null;
  accessibilityGagal?: boolean;
}

function rakit(opsi: Opsi = {}) {
  const terkirim: PesanEmail[] = [];

  const sender: EmailSender = {
    tersedia: opsi.tersedia ?? true,
    async kirim(pesan) {
      terkirim.push(pesan);
      return opsi.jawab === undefined
        ? { hasil: "terkirim", id: "re_1" }
        : await opsi.jawab(pesan);
    },
  };

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  const service = createEmailService({
    penerima: {
      findPenerimaPascaHapus: async () =>
        opsi.baris === undefined ? { email: ALAMAT, emailVerified: true } : opsi.baris,
      findPenerimaAktif: async () => {
        throw new Error("Berkas ini hanya menguji jalur akun_dihapus (PR-049a)");
      },
    },
    notificationRepository: {
      findById: async () => {
        throw new Error("Berkas ini hanya menguji jalur akun_dihapus (PR-049a)");
      },
    },
    sender,
    accessibility: {
      getMe: async () => {
        if (opsi.accessibilityGagal === true) throw new Error("preferensi tak terbaca");
        return { simpleLanguage: opsi.simpleLanguage ?? null };
      },
    },
    logger,
  });

  return { service, terkirim, logger };
}

describe("kontrak payload job (dibaca worker dari sumber tak tepercaya)", () => {
  it("menolak field yang tidak dikenal", () => {
    // `.strict()` bukan kerapian: payload job datang dari Redis, dan field
    // tambahan yang lolos adalah bidang serang yang tidak pernah direview.
    expect(() =>
      notifyEmailJobSchema.parse({ jenis: "akun_dihapus", userId: USER, to: "penyerang@jahat.id" }),
    ).toThrow();
  });

  it("menolak jenis yang tidak terdaftar", () => {
    expect(() => notifyEmailJobSchema.parse({ jenis: "apa_saja", userId: USER })).toThrow();
  });

  it("menolak userId yang bukan uuid", () => {
    expect(() => notifyEmailJobSchema.parse({ jenis: "akun_dihapus", userId: "bukan" })).toThrow();
  });
});

describe("pengiriman kabar pasca-hapus (AC-1)", () => {
  it("mengirim subject, html, dan teks polos ke alamat pemiliknya", async () => {
    const { service, terkirim } = rakit();

    await expect(service.kirim(JOB)).resolves.toEqual({ terkirim: true });
    expect(terkirim[0]?.to).toBe(ALAMAT);
    expect(terkirim[0]?.subject).toBe("Akun Nawasena Anda sudah dihapus");
    expect(terkirim[0]?.html).toContain('<html lang="id">');
    expect(terkirim[0]?.text).toContain("30 hari");
  });

  it("alamat dibaca dari baris akun, BUKAN dari payload job", async () => {
    // Payload job mengendap di Redis (AOF, `noeviction`) di luar jangkauan
    // enkripsi kolom ADR-007, dan alamat email adalah PII. Aturan yang sama
    // dengan `notify:push` yang membawa notificationId alih-alih token.
    const { service, terkirim } = rakit({ baris: { email: "lain@contoh.id", emailVerified: true } });

    await service.kirim(JOB);

    expect(terkirim[0]?.to).toBe("lain@contoh.id");
    expect(JSON.stringify(JOB)).not.toContain("@");
  });
});

describe("kabar ini TIDAK tunduk preferensi kanal (AC-3)", () => {
  it("service tidak pernah membaca preferensi kanal mana pun", async () => {
    // Bentuk paling jujur dari jaminan ini: tidak ada dependensi preferensi
    // kanal di `EmailServiceDeps` sama sekali, jadi tidak ada tempat opt-out
    // bisa membungkam kabar ini. Preferensi mengatur kabar yang punya kanal
    // lain; kabar ini tidak punya. Opt-out yang membungkamnya bukan lagi
    // preferensi melainkan lubang.
    const { service, terkirim } = rakit();

    await service.kirim(JOB);

    expect(terkirim).toHaveLength(1);
  });
});

describe("varian bahasa mengikuti preferensi pemiliknya (AC-5, ADR-008)", () => {
  it("simpleLanguage aktif → kalimat varian sederhana", async () => {
    const { service, terkirim } = rakit({ simpleLanguage: true });

    await service.kirim(JOB);

    expect(terkirim[0]?.text).toContain("Anda masih bisa membatalkan ini.");
  });

  it("belum memilih (null) → varian baku", async () => {
    const { service, terkirim } = rakit({ simpleLanguage: null });

    await service.kirim(JOB);

    expect(terkirim[0]?.text).toContain("Data Anda masih bisa dipulihkan");
  });

  it("preferensi tak terbaca → kabar TETAP terkirim dalam varian baku", async () => {
    // Kabar dalam varian baku jauh lebih baik daripada tidak ada kabar — dan di
    // jalur ini "tidak ada kabar" berarti seseorang tidak pernah tahu akunnya
    // dihapus.
    const { service, terkirim } = rakit({ accessibilityGagal: true });

    await expect(service.kirim(JOB)).resolves.toEqual({ terkirim: true });
    expect(terkirim[0]?.text).toContain("Data Anda masih bisa dipulihkan");
  });

  it("preferensi dibaca meski akunnya sudah terhapus", async () => {
    // Barisnya SELAMAT dari soft delete (yang terhapus hanya `users`), jadi
    // pilihan bahasa seseorang tetap dihormati pada kabar terakhir yang ia
    // terima. Andai tidak, justru pengguna yang paling terbantu teks sederhana
    // yang akan menerima kabar terpenting dalam bentuk yang paling sulit ia baca.
    const { service, terkirim } = rakit({ simpleLanguage: true });

    await service.kirim(JOB);

    expect(terkirim[0]?.text).toContain("Lewat dari itu, data Anda hilang selamanya.");
  });
});

describe("keadaan yang TIDAK boleh menjadi kegagalan job", () => {
  it("akun tidak lagi berstatus terhapus → selesai, bukan gagal", async () => {
    // Dipulihkan lewat support di antara enqueue dan eksekusi. Mengabarkan
    // penghapusan yang sudah dibatalkan lebih buruk daripada diam.
    const { service, terkirim } = rakit({ baris: null });

    const hasil = await service.kirim(JOB);

    expect(hasil).toEqual({ terkirim: false, dilewati: "akun-tidak-terhapus" });
    expect(terkirim).toEqual([]);
  });

  it("alamat ditolak provider → selesai, bukan diulang empat kali", async () => {
    const { service } = rakit({
      jawab: () => ({ hasil: "alamat-ditolak", alasan: "Invalid to: [alamat]" }),
    });

    const hasil = await service.kirim(JOB);

    expect(hasil).toEqual({ terkirim: false, dilewati: "alamat-ditolak" });
  });

  it("kanal email belum dikonfigurasi → dilewati, TETAPI dicatat sebagai error", async () => {
    // `error`, bukan `warn` seperti push: kabar ini satu-satunya yang diterima
    // penerimanya. Kanal yang mati berarti seseorang tidak akan pernah tahu
    // akunnya dihapus — bukan keadaan yang boleh lewat sebagai catatan kecil.
    const { service, terkirim, logger } = rakit({ tersedia: false });

    const hasil = await service.kirim(JOB);

    expect(hasil).toEqual({ terkirim: false, dilewati: "kanal-mati" });
    expect(terkirim).toEqual([]);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe("alamat yang belum terbukti tidak dikirimi apa pun", () => {
  it("emailVerified false → dilewati", async () => {
    // Alamat yang diketik sendiri lewat PUT /me tidak pernah terbukti miliknya
    // (PR-020a). Mengirimi kabar "akun Anda sudah dihapus" ke alamat yang belum
    // terbukti berarti mengabarkan keadaan akun seseorang kepada orang lain
    // yang kebetulan alamatnya diketikkan — dan pada pesan bertema keamanan,
    // itu justru bahan phishing yang ampuh.
    const { service, terkirim } = rakit({
      baris: { email: "diketik-sendiri@contoh.id", emailVerified: false },
    });

    const hasil = await service.kirim(JOB);

    expect(hasil).toEqual({ terkirim: false, dilewati: "alamat-belum-terbukti" });
    expect(terkirim).toEqual([]);
  });

  it("akun tanpa nomor HP DAN tanpa alamat → dicatat sebagai error", async () => {
    // Tidak seharusnya bisa terjadi: pendaftaran hanya lewat OTP (punya nomor)
    // atau Google (punya alamat terverifikasi). Dicatat `error` justru karena
    // begitu — ia berarti ada akun tanpa satu pun kanal.
    const { service, logger } = rakit({ baris: { email: null, emailVerified: false } });

    const hasil = await service.kirim(JOB);

    expect(hasil).toEqual({ terkirim: false, dilewati: "tanpa-alamat" });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe("kegagalan yang PANTAS diulang tetap dilempar", () => {
  it("EmailError diteruskan supaya BullMQ mengulang", async () => {
    // Melempar kembali adalah satu-satunya cara retry (4 attempts, backoff
    // 30 dtk, SDD §16) benar-benar terjadi.
    const { service } = rakit({
      jawab: () => {
        throw new EmailError("EMAIL_RATE_LIMIT", "Resend gagal (HTTP 429)");
      },
    });

    await expect(service.kirim(JOB)).rejects.toMatchObject({ code: "EMAIL_RATE_LIMIT" });
  });

  it("log kegagalan tidak memuat alamat tujuan", async () => {
    const { service, logger } = rakit({
      jawab: () => {
        throw new EmailError("EMAIL_TIDAK_TERSEDIA", "Resend gagal (HTTP 503, [alamat])");
      },
    });

    await service.kirim(JOB).catch(() => undefined);

    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(ALAMAT);
  });
});
