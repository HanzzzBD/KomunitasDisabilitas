// Unit service hapus akun (PR-021).
//
// Fokusnya SATU: apa yang terjadi sebelum penghapusan dijalankan. Penghapusan
// itu sendiri satu panggilan repository yang atomisitasnya hanya bisa
// dibuktikan terhadap PostgreSQL (auth-account-db.test.ts); yang bisa salah di
// lapisan ini adalah keputusan — cara pembuktian mana yang diterima, kapan
// ditolak, dan apa yang tercatat saat ditolak.
import { describe, it, expect, vi } from "vitest";
import { AUDIT_ACTION, QUEUE_NAME } from "@nawasena/schemas";
import { AppError } from "../src/core/http/index.js";
import {
  buildAccountDeletedMessage,
  createAccountService,
  HARI_SEBELUM_PURGE,
} from "../src/modules/auth/index.js";
import type { OtpSender } from "../src/modules/auth/services/otp-sender.js";
import type { AuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";

const USER_ID = "01912345-89ab-7def-8123-000000000001";
const REQUEST_ID = "01912345-89ab-7def-8123-0000000000ff";
const PHONE = "+6281234567890";
const GOOGLE_ID = "google-sub-abc";

const actor = { userId: USER_ID, requestId: REQUEST_ID };

interface KonteksAkun {
  phone: string | null;
  googleId: string | null;
}

/**
 * Repository palsu: hanya dua metode yang dipakai jalur ini. Sisanya meledak,
 * supaya pemakaian tak sengaja terlihat sebagai kegagalan test — bukan lolos
 * diam-diam lewat stub yang mengembalikan undefined.
 */
function fakeUserRepository(konteks: KonteksAkun | null, hasilHapus?: { revokedCount: number }) {
  const dipanggil = { hapus: 0 };
  const repository = {
    async findDeleteContext() {
      return konteks === null ? null : { id: USER_ID, ...konteks };
    },
    async deleteAccount() {
      dipanggil.hapus += 1;
      return hasilHapus === undefined ? null : { tokenVersion: 4, ...hasilHapus };
    },
  } as unknown as AuthUserRepository;
  return { repository, dipanggil };
}

function fakeAudit() {
  const entri: Array<{ action: string; entityId: string | null; meta: unknown }> = [];
  const auditLog = vi.fn((_actor, action, _entity, entityId, meta) => {
    entri.push({ action: action as string, entityId, meta });
  });
  const tahap = () =>
    entri
      .filter((e) => e.action === AUDIT_ACTION.ACCOUNT_DELETED)
      .map((e) => (e.meta as { stage: string }).stage);
  return { auditLog: auditLog as never, entri, tahap };
}

/** Verifier + exchange Google palsu; `sub` yang dikembalikan bisa diatur. */
function fakeGoogle(googleId: string) {
  const dipanggil = { tukar: 0 };
  return {
    exchange: {
      async exchange() {
        dipanggil.tukar += 1;
        return "id-token-palsu";
      },
    },
    verifier: {
      async verify() {
        return { googleId, email: "orang@contoh.id", fullName: "Orang Uji" };
      },
    },
    dipanggil,
  };
}

const GOOGLE_INPUT = {
  code: "kode-google",
  codeVerifier: "a".repeat(43),
  redirectUri: "http://localhost:5173/masuk/google",
};

describe("hapus akun — jalur kode OTP", () => {
  it("mencocokkan kode ke nomor MILIK AKUN, bukan nomor dari input", async () => {
    // Ini bentuk paling penting dari "user A tidak bisa menghapus user B":
    // nomor yang dikirimi tantangan datang dari baris akun, dan body permintaan
    // tidak punya field untuk menyebut nomor lain sama sekali.
    const { repository, dipanggil } = fakeUserRepository(
      { phone: PHONE, googleId: null },
      { revokedCount: 3 },
    );
    const konfirmasiKode = vi.fn(async () => {});
    const audit = fakeAudit();

    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode },
      auditLog: audit.auditLog,
    });

    const hasil = await service.deleteAccount(actor, { otpCode: "482913" });

    expect(konfirmasiKode).toHaveBeenCalledWith(PHONE, "482913", { requestId: REQUEST_ID });
    expect(dipanggil.hapus).toBe(1);
    expect(hasil.revokedCount).toBe(3);
  });

  it("mencatat requested lalu completed, dengan jumlah sesi yang dicabut", async () => {
    const { repository } = fakeUserRepository({ phone: PHONE, googleId: null }, { revokedCount: 2 });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      auditLog: audit.auditLog,
    });

    await service.deleteAccount(actor, { otpCode: "482913" });

    expect(audit.tahap()).toEqual(["requested", "completed"]);
    expect(audit.entri.at(-1)?.meta).toEqual({
      stage: "completed",
      method: "otp",
      revokedCount: 2,
    });
  });

  it("kode salah → tidak menghapus apa pun, dan tercatat sebagai rejected", async () => {
    const { repository, dipanggil } = fakeUserRepository({ phone: PHONE, googleId: null });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: {
        konfirmasiKode: async () => {
          throw new AppError("KODE_OTP_SALAH");
        },
      },
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { otpCode: "000000" })).rejects.toMatchObject({
      code: "KODE_OTP_SALAH",
    });
    expect(dipanggil.hapus).toBe(0);
    expect(audit.tahap()).toEqual(["rejected"]);
    expect(audit.entri[0]?.meta).toEqual({ stage: "rejected", method: "otp" });
  });

  it("akun tanpa nomor → ditolak dengan saran memakai Google", async () => {
    const { repository, dipanggil } = fakeUserRepository({ phone: null, googleId: GOOGLE_ID });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      auditLog: audit.auditLog,
    });

    const err = await service.deleteAccount(actor, { otpCode: "482913" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("CARA_KONFIRMASI_TIDAK_COCOK");
    // Pesan buntu memaksa pengguna menebak; hint menyebut jalan yang ADA.
    expect((err as AppError).hint).toContain("Google");
    expect(dipanggil.hapus).toBe(0);
    expect(audit.tahap()).toEqual(["rejected"]);
  });

  it("OTP mati di server → 503, BUKAN melewatkan pembuktian", async () => {
    // Kegagalan yang paling berbahaya untuk kontrol seperti ini adalah gagal
    // terbuka: fitur pembuktian mati, dan penghapusan tetap berjalan.
    const { repository, dipanggil } = fakeUserRepository({ phone: PHONE, googleId: null });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: undefined,
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { otpCode: "482913" })).rejects.toMatchObject({
      code: "KONFIRMASI_TIDAK_TERSEDIA",
    });
    expect(dipanggil.hapus).toBe(0);
  });
});

describe("hapus akun — jalur Google", () => {
  it("sub cocok → akun dihapus", async () => {
    const { repository, dipanggil } = fakeUserRepository(
      { phone: null, googleId: GOOGLE_ID },
      { revokedCount: 1 },
    );
    const google = fakeGoogle(GOOGLE_ID);
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      google,
      auditLog: audit.auditLog,
    });

    await service.deleteAccount(actor, { google: GOOGLE_INPUT });

    expect(google.dipanggil.tukar).toBe(1);
    expect(dipanggil.hapus).toBe(1);
    expect(audit.tahap()).toEqual(["requested", "completed"]);
    expect(audit.entri.at(-1)?.meta).toMatchObject({ method: "google" });
  });

  it("sub milik akun Google LAIN → ditolak, tidak menghapus apa pun", async () => {
    // Consent-nya sah dan tanda tangannya benar; yang salah adalah pemiliknya.
    // Tanpa perbandingan ini, siapa pun yang bisa menyelesaikan alur Google —
    // dengan akun Google-nya sendiri — bisa menghapus akun orang lain yang
    // access token-nya ia pegang.
    const { repository, dipanggil } = fakeUserRepository({ phone: null, googleId: GOOGLE_ID });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      google: fakeGoogle("google-sub-penyerang"),
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { google: GOOGLE_INPUT })).rejects.toMatchObject({
      code: "KONFIRMASI_GOOGLE_BEDA_AKUN",
    });
    expect(dipanggil.hapus).toBe(0);
    expect(audit.tahap()).toEqual(["rejected"]);
  });

  it("akun tanpa tautan Google → ditolak dengan saran memakai OTP", async () => {
    const { repository } = fakeUserRepository({ phone: PHONE, googleId: null });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      google: fakeGoogle(GOOGLE_ID),
      auditLog: audit.auditLog,
    });

    const err = await service
      .deleteAccount(actor, { google: GOOGLE_INPUT })
      .catch((e: unknown) => e);

    expect((err as AppError).code).toBe("CARA_KONFIRMASI_TIDAK_COCOK");
    expect((err as AppError).hint).toContain("OTP");
  });

  it("kredensial Google kosong di server → 503, bukan lolos", async () => {
    const { repository, dipanggil } = fakeUserRepository({ phone: null, googleId: GOOGLE_ID });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      google: undefined,
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { google: GOOGLE_INPUT })).rejects.toMatchObject({
      code: "KONFIRMASI_TIDAK_TERSEDIA",
    });
    expect(dipanggil.hapus).toBe(0);
  });
});

describe("hapus akun — keadaan akun", () => {
  it("akun sudah tidak aktif → sesi tidak valid, tanpa menyentuh pembuktian", async () => {
    const { repository } = fakeUserRepository(null);
    const konfirmasiKode = vi.fn(async () => {});
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode },
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { otpCode: "482913" })).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
    expect(konfirmasiKode).not.toHaveBeenCalled();
    // Tidak ada `rejected`: tidak ada yang mencoba membuktikan apa pun.
    expect(audit.tahap()).toEqual([]);
  });

  it("kalah balapan dengan permintaan hapus lain → tidak mencatat completed", async () => {
    // deleteAccount mengembalikan null saat barisnya sudah tidak aktif. Mencatat
    // `completed` di situ akan membuat audit mengklaim penghapusan yang
    // dilakukan permintaan LAIN — dan menghitung ganda jumlah sesi tercabut.
    const { repository } = fakeUserRepository({ phone: PHONE, googleId: null }, undefined);
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { otpCode: "482913" })).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
    expect(audit.tahap()).toEqual(["requested"]);
  });
});

/** Sender penangkap; `gagal: true` meniru provider yang mati. */
function fakeSender(opsi: { gagal?: boolean } = {}) {
  const terkirim: Array<{ phone: string; text: string }> = [];
  const sender: OtpSender = {
    name: "uji",
    async send(pesan) {
      if (opsi.gagal === true) throw new Error("provider mati");
      terkirim.push({ ...pesan });
    },
  };
  return { sender, terkirim };
}

/** Beri kesempatan pengiriman fire-and-forget menyelesaikan microtask-nya. */
const tungguSebentar = () => new Promise((r) => setTimeout(r, 0));

/** Registry antrean penangkap; `gagal: true` meniru Redis yang tidak terjangkau. */
function fakeQueues(opsi: { gagal?: boolean } = {}) {
  const diantre: Array<{ name: string; payload: unknown }> = [];
  const queues = {
    async enqueue(name: string, payload: unknown) {
      if (opsi.gagal === true) throw new Error("redis tidak terjangkau");
      diantre.push({ name, payload });
      return { id: "job-1", name };
    },
  } as unknown as Parameters<typeof createAccountService>[0]["queues"];
  return { queues, diantre };
}

describe("pemberitahuan pasca-hapus", () => {
  it("isi pesan menyebut apa yang terjadi, batas waktu, dan cara melapor", () => {
    // Ketiganya adalah SELURUH gunanya. Pesan yang hanya berkata "akun dihapus"
    // tidak memberi korban satu pun langkah berikutnya.
    const pesan = buildAccountDeletedMessage();
    expect(pesan).toContain("Nawasena");
    expect(pesan).toContain("dihapus");
    expect(pesan).toContain(String(HARI_SEBELUM_PURGE));
    expect(pesan).toMatch(/hubungi kami/i);
    // Tanpa tautan: pesan yang meminta orang mengeklik sesuatu tepat setelah
    // kejadian mencurigakan punya bentuk yang sama dengan phishing.
    expect(pesan).not.toMatch(/https?:\/\//);
  });

  it("terkirim ke nomor akun setelah penghapusan berhasil", async () => {
    const { repository } = fakeUserRepository({ phone: PHONE, googleId: null }, { revokedCount: 1 });
    const { sender, terkirim } = fakeSender();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      sender,
      auditLog: fakeAudit().auditLog,
    });

    await service.deleteAccount(actor, { otpCode: "482913" });
    await tungguSebentar();

    expect(terkirim).toEqual([{ phone: PHONE, text: buildAccountDeletedMessage() }]);
  });

  it("TIDAK terkirim saat konfirmasi gagal — akunnya masih utuh", async () => {
    // Pesan "akun Anda sudah dihapus" untuk akun yang tidak jadi dihapus adalah
    // kepanikan yang kita ciptakan sendiri.
    const { repository } = fakeUserRepository({ phone: PHONE, googleId: null });
    const { sender, terkirim } = fakeSender();
    const service = createAccountService({
      userRepository: repository,
      otp: {
        konfirmasiKode: async () => {
          throw new AppError("KODE_OTP_SALAH");
        },
      },
      sender,
      auditLog: fakeAudit().auditLog,
    });

    await service.deleteAccount(actor, { otpCode: "000000" }).catch(() => undefined);
    await tungguSebentar();

    expect(terkirim).toEqual([]);
  });

  it("provider mati TIDAK menggagalkan penghapusan", async () => {
    // Akunnya sudah terhapus saat pengiriman dicoba. Melempar di titik ini akan
    // membuat pengguna mengira penghapusannya gagal, lalu mencobanya lagi.
    const { repository, dipanggil } = fakeUserRepository(
      { phone: PHONE, googleId: null },
      { revokedCount: 0 },
    );
    const warn = vi.fn();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      sender: fakeSender({ gagal: true }).sender,
      auditLog: fakeAudit().auditLog,
      logger: { warn, error: vi.fn() },
    });

    await expect(service.deleteAccount(actor, { otpCode: "482913" })).resolves.toEqual({
      revokedCount: 0,
    });
    await tungguSebentar();

    expect(dipanggil.hapus).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    // Nomor tujuan TIDAK ikut ke log: yang berguna saat menyelidiki adalah
    // provider mana yang gagal, bukan siapa yang tidak menerimanya.
    expect(JSON.stringify(warn.mock.calls)).not.toContain(PHONE);
  });

  it("akun tanpa nomor: SMS tidak dipakai — kanalnya email (PR-049a)", async () => {
    const { repository, dipanggil } = fakeUserRepository(
      { phone: null, googleId: GOOGLE_ID },
      { revokedCount: 0 },
    );
    const { sender, terkirim } = fakeSender();
    const { queues } = fakeQueues();
    const service = createAccountService({
      userRepository: repository,
      google: fakeGoogle(GOOGLE_ID),
      sender,
      queues,
      auditLog: fakeAudit().auditLog,
    });

    await service.deleteAccount(actor, { google: GOOGLE_INPUT });
    await tungguSebentar();

    expect(dipanggil.hapus).toBe(1);
    // Kanal WhatsApp/SMS memang tidak dipakai — akun ini tidak punya nomor.
    // Sampai PR-049a, itu berarti ia tidak menerima APA PUN; sekarang kabarnya
    // lewat antrean email (diuji di blok "gerbang U-02" di bawah).
    expect(terkirim).toEqual([]);
  });

  it("tanpa provider sama sekali: penghapusan tetap berjalan", async () => {
    const { repository, dipanggil } = fakeUserRepository(
      { phone: PHONE, googleId: null },
      { revokedCount: 0 },
    );
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      sender: undefined,
      auditLog: fakeAudit().auditLog,
    });

    await service.deleteAccount(actor, { otpCode: "482913" });

    expect(dipanggil.hapus).toBe(1);
  });
});

/**
 * GERBANG U-02 — durabilitas kabar (keputusan owner 2026-09-05).
 *
 * Blok ini menguji satu hal, dan satu hal itu adalah seluruh alasan PR-049a
 * ada: bagi pengguna Google-only, kabar "akun Anda sudah dihapus" adalah
 * SATU-SATUNYA kabar yang ia terima. Ia tidak punya nomor, dan sesudah
 * penghapusan ia tidak punya sesi maupun layar tempat notifikasi in-app bisa
 * dibaca. Kabar yang dikirim `void ...catch()` seperti jalur SMS akan ikut mati
 * bersama prosesnya — tanpa retry, tanpa jejak, dan tanpa satu pun cara
 * pengguna mengetahui bahwa jendela pembatalan 30 hari itu ada.
 */
describe("gerbang U-02 — kabar pasca-hapus lahir dari ANTREAN", () => {
  function rakitTanpaNomor(opsiAntrean: { gagal?: boolean } = {}) {
    const { repository, dipanggil } = fakeUserRepository(
      { phone: null, googleId: GOOGLE_ID },
      { revokedCount: 2 },
    );
    const { queues, diantre } = fakeQueues(opsiAntrean);
    const logger = { warn: vi.fn(), error: vi.fn() };
    const service = createAccountService({
      userRepository: repository,
      google: fakeGoogle(GOOGLE_ID),
      queues,
      auditLog: fakeAudit().auditLog,
      logger,
    });
    return { service, diantre, dipanggil, logger };
  }

  it("job notify-email diantrekan, membawa REFERENSI saja", async () => {
    const { service, diantre } = rakitTanpaNomor();

    await service.deleteAccount(actor, { google: GOOGLE_INPUT });

    expect(diantre).toHaveLength(1);
    expect(diantre[0]?.name).toBe(QUEUE_NAME.NOTIFY_EMAIL);
    // Tanpa alamat email di payload: job mengendap di Redis (AOF, noeviction)
    // di luar jangkauan enkripsi kolom ADR-007, dan alamat email adalah PII.
    expect(diantre[0]?.payload).toEqual({ jenis: "akun_dihapus", userId: USER_ID });
  });

  it("job sudah tersimpan SEBELUM permintaan dijawab", async () => {
    // Di-await, berbeda dari jalur SMS. Yang ditunggu hanya penulisan job ke
    // Redis (milidetik), bukan panggilan provider yang bisa memakan sepuluh
    // detik — jadi biaya latensinya tidak ada, sementara imbalannya nyata:
    // begitu 204 dijawab, kabarnya sudah berada di luar proses ini.
    const { service, diantre } = rakitTanpaNomor();

    await service.deleteAccount(actor, { google: GOOGLE_INPUT });

    // TANPA `tungguSebentar()` — bila ini fire-and-forget, di sini masih kosong.
    expect(diantre).toHaveLength(1);
  });

  it("TIDAK diantrekan saat konfirmasi gagal — akunnya masih utuh", async () => {
    const { repository } = fakeUserRepository({ phone: null, googleId: GOOGLE_ID });
    const { queues, diantre } = fakeQueues();
    const service = createAccountService({
      userRepository: repository,
      // `sub` berbeda → consent sah tetapi milik akun Google lain.
      google: fakeGoogle("google-sub-orang-lain"),
      queues,
      auditLog: fakeAudit().auditLog,
    });

    await service.deleteAccount(actor, { google: GOOGLE_INPUT }).catch(() => undefined);

    expect(diantre).toEqual([]);
  });

  it("antrean tidak terjangkau TIDAK menggagalkan penghapusan, tetapi berteriak", async () => {
    // Akunnya sudah terhapus saat pengantrean dicoba; membalas kesalahan di
    // titik ini akan membuat pengguna mengira penghapusannya gagal lalu
    // mencobanya lagi. `error`, bukan `warn`: ia berarti seseorang tidak akan
    // pernah tahu akunnya dihapus.
    const { service, dipanggil, logger } = rakitTanpaNomor({ gagal: true });

    await expect(service.deleteAccount(actor, { google: GOOGLE_INPUT })).resolves.toEqual({
      revokedCount: 2,
    });

    expect(dipanggil.hapus).toBe(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("tanpa registry antrean: penghapusan tetap berjalan", async () => {
    const { repository, dipanggil } = fakeUserRepository(
      { phone: null, googleId: GOOGLE_ID },
      { revokedCount: 0 },
    );
    const service = createAccountService({
      userRepository: repository,
      google: fakeGoogle(GOOGLE_ID),
      auditLog: fakeAudit().auditLog,
    });

    await service.deleteAccount(actor, { google: GOOGLE_INPUT });

    expect(dipanggil.hapus).toBe(1);
  });

  it("akun BERNOMOR tidak ikut mengantre — kanalnya SMS, bukan dua-duanya", async () => {
    // Dua kabar untuk satu peristiwa bukan ketelitian melainkan kebisingan, dan
    // nomor HP adalah kanal yang sudah TERBUKTI miliknya (setiap akun bernomor
    // pernah menerima kode OTP di sana).
    const { repository } = fakeUserRepository({ phone: PHONE, googleId: null }, { revokedCount: 1 });
    const { sender, terkirim } = fakeSender();
    const { queues, diantre } = fakeQueues();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      sender,
      queues,
      auditLog: fakeAudit().auditLog,
    });

    await service.deleteAccount(actor, { otpCode: "482913" });
    await tungguSebentar();

    expect(terkirim).toHaveLength(1);
    expect(diantre).toEqual([]);
  });
});

describe("hapus akun — audit bebas PII", () => {
  it("tidak pernah mencatat nomor, googleId, atau email", async () => {
    // audit_logs bertahan 2 tahun (SDD §6.4) — jauh melewati baris users yang
    // memilikinya. Menaruh nomor di sana berarti hak hapus PDP tidak benar-benar
    // menghapus, dan tidak ada yang akan menyadarinya.
    const { repository } = fakeUserRepository(
      { phone: PHONE, googleId: GOOGLE_ID },
      { revokedCount: 1 },
    );
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      auditLog: audit.auditLog,
    });

    await service.deleteAccount(actor, { otpCode: "482913" });

    const semua = JSON.stringify(audit.entri);
    expect(semua).not.toContain(PHONE);
    expect(semua).not.toContain(GOOGLE_ID);
    expect(semua).not.toContain("482913");
    // Yang boleh ada: id akun (bukan PII) sebagai entityId.
    expect(audit.entri.every((e) => e.entityId === USER_ID)).toBe(true);
  });
});
