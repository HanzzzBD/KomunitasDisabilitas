// Unit adapter Resend (PR-049a) — klasifikasi jawaban provider, dan satu
// jaminan yang tidak boleh pernah dilanggar: alamat email tidak pernah bocor ke
// pesan galat.
//
// `fetch` di-inject, bukan di-mock global: repo ini tidak punya msw/nock, dan
// DI `FetchLike` membuat setiap cabang provider bisa diuji tanpa dependensi
// baru — pola yang sama dengan `fcm.sender` dan `fonnte.sender`.
import { describe, it, expect, vi } from "vitest";
import {
  createEmailSender,
  createEmailSenderFromEnv,
  createUnavailableEmailSender,
  EmailError,
  redaksiAlamat,
} from "../src/modules/notifications/index.js";
import type { FetchLike } from "../src/modules/auth/services/fonnte.sender.js";

const ALAMAT = "penerima.rahasia@contoh.id";

function jawaban(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rakit(langkah: (url: string) => Response | Promise<Response>) {
  const panggilan: Array<{ url: string; body: unknown }> = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    panggilan.push({
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    return await langkah(url);
  });

  const sender = createEmailSender(
    {
      apiKey: "kunci-uji",
      from: "Nawasena <kabar@nawasena.uji>",
      timeoutMs: 5_000,
      baseUrl: "https://resend.uji",
    },
    fetch as unknown as FetchLike,
  );

  return { sender, panggilan };
}

const pesan = { to: ALAMAT, subject: "Judul", html: "<p>Isi</p>", text: "Isi" };

describe("pengiriman", () => {
  it("POST ke /emails dengan from, to, subject, html, DAN text", async () => {
    const { sender, panggilan } = rakit(() => jawaban(200, { id: "re_123" }));

    await expect(sender.kirim(pesan)).resolves.toEqual({ hasil: "terkirim", id: "re_123" });
    expect(panggilan[0]?.url).toBe("https://resend.uji/emails");
    expect(panggilan[0]?.body).toEqual({
      from: "Nawasena <kabar@nawasena.uji>",
      to: [ALAMAT],
      subject: "Judul",
      html: "<p>Isi</p>",
      // Bagian teks polos ikut pada SETIAP kirim — bukan hanya saat kebetulan
      // diisi pemanggil. Klien email berbasis teks dan sebagian pembaca layar
      // membacanya.
      text: "Isi",
    });
  });

  it("jawaban tanpa id tetap dihitung terkirim", async () => {
    // Id provider hanya berguna untuk penelusuran; ketiadaannya bukan alasan
    // mengulang pengiriman yang sudah diterima.
    const { sender } = rakit(() => jawaban(200, {}));

    await expect(sender.kirim(pesan)).resolves.toEqual({ hasil: "terkirim", id: null });
  });
});

describe("klasifikasi jawaban", () => {
  it.each([
    ["422", 422],
    ["400", 400],
  ])("%s → alamat-ditolak (bukan exception)", async (_nama, status) => {
    // Alamat yang ditolak tidak akan menjadi sah pada percobaan kedua, ketiga,
    // maupun keempat. Menjadikannya exception berarti empat panggilan jaringan
    // dan satu baris DLQ untuk sesuatu yang jawabannya sudah pasti.
    const { sender } = rakit(() => jawaban(status, { message: "Invalid to field" }));

    const hasil = await sender.kirim(pesan);
    expect(hasil.hasil).toBe("alamat-ditolak");
  });

  it.each([
    ["429", 429, "EMAIL_RATE_LIMIT"],
    ["500", 500, "EMAIL_TIDAK_TERSEDIA"],
    ["503", 503, "EMAIL_TIDAK_TERSEDIA"],
  ])("%s → dilempar supaya BullMQ mengulang", async (_nama, status, code) => {
    const { sender } = rakit(() => jawaban(status, {}));

    await expect(sender.kirim(pesan)).rejects.toMatchObject({ name: "EmailError", code });
  });

  it("401 → EMAIL_KREDENSIAL_TIDAK_VALID, dilempar supaya terlihat di DLQ", async () => {
    // Kredensial salah tidak membaik dengan diulang, tetapi ia JUGA tidak boleh
    // diam: ia mematikan kanal bagi SEMUA orang, bukan satu alamat.
    const { sender } = rakit(() => jawaban(401, { message: "API key is invalid" }));

    await expect(sender.kirim(pesan)).rejects.toMatchObject({
      code: "EMAIL_KREDENSIAL_TIDAK_VALID",
    });
  });

  it("timeout → EMAIL_TIMEOUT, galat jaringan → EMAIL_JARINGAN", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const a = rakit(() => {
      throw timeout;
    });
    await expect(a.sender.kirim(pesan)).rejects.toMatchObject({ code: "EMAIL_TIMEOUT" });

    const b = rakit(() => {
      throw new Error("ECONNRESET");
    });
    await expect(b.sender.kirim(pesan)).rejects.toMatchObject({ code: "EMAIL_JARINGAN" });
  });

  it("badan jawaban yang bukan JSON tidak menjatuhkan adapter", async () => {
    const { sender } = rakit(() => new Response("<html>502</html>", { status: 502 }));

    await expect(sender.kirim(pesan)).rejects.toMatchObject({ code: "EMAIL_TIDAK_TERSEDIA" });
  });
});

describe("alamat email tidak pernah bocor", () => {
  it("tidak muncul di pesan galat mana pun", async () => {
    // Provider lazim mengutip balik alamat tujuan di pesan galatnya, yang
    // berarti PII bisa masuk log lewat pintu yang tidak kita tulis sendiri.
    // Aturan yang sama dengan `alasanAmanUntukLog` pada otp-sender.ts.
    const kasus: Array<[number, unknown]> = [
      [401, { message: `API key tidak berlaku untuk ${ALAMAT}` }],
      [429, { message: `Terlalu banyak kirim ke ${ALAMAT}` }],
      [500, { message: `Gagal mengirim ke ${ALAMAT}` }],
    ];

    for (const [status, body] of kasus) {
      const { sender } = rakit(() => jawaban(status, body));
      const err = await sender.kirim(pesan).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(EmailError);
      expect((err as Error).message).not.toContain(ALAMAT);
      expect((err as Error).message).toContain("[alamat]");
    }
  });

  it("alasan `alamat-ditolak` pun sudah diredaksi", async () => {
    // Nilai balik ini ikut ke log processor — jalur yang sama sekali berbeda
    // dari pesan galat, dan karena itu diuji tersendiri.
    const { sender } = rakit(() => jawaban(422, { message: `Invalid to: ${ALAMAT}` }));

    const hasil = await sender.kirim(pesan);
    expect(hasil).toMatchObject({ hasil: "alamat-ditolak" });
    expect(JSON.stringify(hasil)).not.toContain(ALAMAT);
  });

  it("redaksi menangkap bentuk alamat yang lazim ditulis provider", () => {
    expect(redaksiAlamat("gagal ke a.b+tag@sub.contoh.co.id sebab kuota")).toBe(
      "gagal ke [alamat] sebab kuota",
    );
    expect(redaksiAlamat("<orang@contoh.id> ditolak")).toBe("<[alamat]> ditolak");
  });

  it("keterangan provider dipotong supaya tidak membanjiri log", () => {
    expect(redaksiAlamat("x".repeat(500)).length).toBe(200);
  });
});

describe("adapter tanpa kredensial", () => {
  it("createEmailSenderFromEnv tanpa env → tidak tersedia, boot TIDAK gagal", () => {
    expect(createEmailSenderFromEnv({}).tersedia).toBe(false);
  });

  it.each([
    ["hanya kunci", { RESEND_API_KEY: "x" }],
    ["hanya alamat pengirim", { EMAIL_FROM: "a@b.c" }],
  ])("%s → tetap tidak tersedia", (_nama, env) => {
    // Gerbang env (superRefine) sudah menolak pasangan yang setengah terisi saat
    // boot; ini lapisan keduanya, untuk pemanggil yang merakit env sendiri.
    expect(createEmailSenderFromEnv(env).tersedia).toBe(false);
  });

  it("setiap panggilan menolak dengan kode yang bisa dibedakan", async () => {
    await expect(createUnavailableEmailSender().kirim(pesan)).rejects.toMatchObject({
      code: "EMAIL_TIDAK_DIKONFIGURASI",
    });
  });
});
