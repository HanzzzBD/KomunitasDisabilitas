// Test adapter pengirim OTP (PR-016b): Fonnte, Twilio, rantai fallback, dan
// perakitan dari env. Seluruh panggilan HTTP dipalsukan — tidak ada pesan
// nyata yang keluar dan tidak ada kredensial nyata yang dibutuhkan.
import { describe, it, expect, vi } from "vitest";
import { loadEnv, EnvError } from "../src/core/config/env.js";
import {
  alasanAmanUntukLog,
  buildOtpMessage,
  createFallbackOtpSender,
  createOtpSenderFromEnv,
  createUnavailableOtpSender,
  OtpSenderError,
  type OtpSender,
} from "../src/modules/auth/services/otp-sender.js";
import { createFonnteSender, type FetchLike } from "../src/modules/auth/services/fonnte.sender.js";
import { createTwilioSender } from "../src/modules/auth/services/twilio.sender.js";

const KODE = "482913";
const PESAN = { phone: "+6281234567890", text: buildOtpMessage(KODE) };
const FONNTE = { token: "token-fonnte-uji", baseUrl: "https://fonnte.uji", timeoutMs: 5000 };
const TWILIO = {
  accountSid: "ACuji0000000000000000000000000000",
  authToken: "token-twilio-uji",
  from: "+15550000000",
  baseUrl: "https://twilio.uji",
  timeoutMs: 5000,
};

/** fetch palsu yang merekam panggilan dan membalas respons yang ditentukan. */
function fakeFetch(balasan: Array<{ status: number; body?: unknown } | Error>) {
  const panggilan: Array<{ url: string; init: RequestInit }> = [];
  let ke = 0;
  const impl: FetchLike = (url, init) => {
    panggilan.push({ url, init });
    const next = balasan[Math.min(ke, balasan.length - 1)];
    ke += 1;
    if (next instanceof Error) return Promise.reject(next);
    const { status, body } = next ?? { status: 200 };
    return Promise.resolve(
      new Response(JSON.stringify(body ?? {}), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { impl, panggilan };
}

const bacaBody = (init: RequestInit) => new URLSearchParams(String(init.body));
const logger = () => ({ warn: vi.fn() });

describe("isi pesan OTP", () => {
  it("memuat kode, masa berlaku, dan peringatan anti-phishing", () => {
    const pesan = buildOtpMessage("482913");
    expect(pesan).toContain("482913");
    expect(pesan).toContain("5 menit");
    expect(pesan).toContain("Jangan berikan kode ini kepada siapa pun");
    expect(pesan).toContain("Nawasena");
  });
});

describe("adapter Fonnte", () => {
  it("POST /send dengan token, nomor tujuan, dan pesan berisi kode", async () => {
    const { impl, panggilan } = fakeFetch([{ status: 200, body: { status: true } }]);
    await createFonnteSender(FONNTE, impl).send(PESAN);

    expect(panggilan).toHaveLength(1);
    expect(panggilan[0]!.url).toBe("https://fonnte.uji/send");
    expect(panggilan[0]!.init.method).toBe("POST");
    expect((panggilan[0]!.init.headers as Record<string, string>).Authorization).toBe(
      FONNTE.token,
    );
    const body = bacaBody(panggilan[0]!.init);
    expect(body.get("target")).toBe(PESAN.phone);
    expect(body.get("message")).toContain(KODE);
  });

  it("HTTP 200 tetapi status:false → gagal (jebakan khas Fonnte)", async () => {
    const { impl } = fakeFetch([{ status: 200, body: { status: false, reason: "saldo habis" } }]);
    const err = await createFonnteSender(FONNTE, impl)
      .send(PESAN)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OtpSenderError);
    expect((err as OtpSenderError).provider).toBe("fonnte");
    expect((err as Error).message).toContain("saldo habis");
  });

  it("HTTP 500 → gagal dengan menyebut status", async () => {
    const { impl } = fakeFetch([{ status: 500 }]);
    await expect(createFonnteSender(FONNTE, impl).send(PESAN)).rejects.toThrow(/HTTP 500/);
  });

  it("jaringan mati/timeout → gagal tanpa membocorkan detail permintaan", async () => {
    const { impl } = fakeFetch([Object.assign(new Error("connect ECONNREFUSED"), { name: "TimeoutError" })]);
    const err = await createFonnteSender(FONNTE, impl)
      .send(PESAN)
      .catch((e: unknown) => e);

    expect((err as Error).message).toBe("gagal menghubungi Fonnte (TimeoutError)");
    expect((err as Error).message).not.toContain(PESAN.phone);
    expect((err as Error).message).not.toContain(KODE);
  });
});

describe("adapter Twilio", () => {
  it("POST Messages.json dengan Basic auth, To/From/Body", async () => {
    const { impl, panggilan } = fakeFetch([{ status: 201, body: { sid: "SM1" } }]);
    await createTwilioSender(TWILIO, impl).send(PESAN);

    expect(panggilan[0]!.url).toBe(
      `https://twilio.uji/2010-04-01/Accounts/${TWILIO.accountSid}/Messages.json`,
    );
    const auth = (panggilan[0]!.init.headers as Record<string, string>).Authorization ?? "";
    expect(auth.startsWith("Basic ")).toBe(true);
    expect(Buffer.from(auth.slice(6), "base64").toString("utf8")).toBe(
      `${TWILIO.accountSid}:${TWILIO.authToken}`,
    );
    const body = bacaBody(panggilan[0]!.init);
    expect(body.get("To")).toBe(PESAN.phone);
    expect(body.get("From")).toBe(TWILIO.from);
    expect(body.get("Body")).toContain(KODE);
  });

  it("HTTP 401 → gagal dengan pesan provider", async () => {
    const { impl } = fakeFetch([
      { status: 401, body: { code: 20003, message: "Authenticate" } },
    ]);
    const err = await createTwilioSender(TWILIO, impl)
      .send(PESAN)
      .catch((e: unknown) => e);

    expect((err as OtpSenderError).provider).toBe("twilio");
    expect((err as Error).message).toContain("HTTP 401");
    expect((err as Error).message).toContain("Authenticate");
  });
});

describe("rantai fallback (AC: Fonnte gagal → Twilio otomatis)", () => {
  function chain(hasil: Array<"ok" | "gagal">) {
    const dipakai: string[] = [];
    const senders: OtpSender[] = hasil.map((h, i) => ({
      name: i === 0 ? "fonnte" : "twilio",
      send: async () => {
        dipakai.push(i === 0 ? "fonnte" : "twilio");
        if (h === "gagal") throw new OtpSenderError(i === 0 ? "fonnte" : "twilio", "gagal uji");
      },
    }));
    const log = logger();
    return { sender: createFallbackOtpSender(senders, log), dipakai, log };
  }

  it("Fonnte sukses → Twilio tidak pernah dipanggil", async () => {
    const { sender, dipakai } = chain(["ok", "ok"]);
    await sender.send(PESAN);
    expect(dipakai).toEqual(["fonnte"]);
  });

  it("Fonnte gagal → Twilio dipakai, pengiriman tetap berhasil", async () => {
    const { sender, dipakai, log } = chain(["gagal", "ok"]);
    await expect(sender.send(PESAN)).resolves.toBeUndefined();
    expect(dipakai).toEqual(["fonnte", "twilio"]);
    expect(log.warn).toHaveBeenCalledWith(
      { provider: "fonnte", alasan: "gagal uji", masihAdaCadangan: true },
      "Pengirim OTP gagal",
    );
  });

  it("semua provider gagal → OtpSenderError menyebut seluruh rantai", async () => {
    const { sender, dipakai } = chain(["gagal", "gagal"]);
    const err = await sender.send(PESAN).catch((e: unknown) => e);
    expect(dipakai).toEqual(["fonnte", "twilio"]);
    expect(err).toBeInstanceOf(OtpSenderError);
    expect((err as OtpSenderError).provider).toBe("fonnte,twilio");
    expect((err as Error).message).toContain("fonnte → twilio");
  });

  it("log rantai tidak pernah memuat nomor atau kode", async () => {
    const { sender, log } = chain(["gagal", "ok"]);
    await sender.send(PESAN);
    const teks = JSON.stringify(log.warn.mock.calls);
    expect(teks).not.toContain(PESAN.phone);
    expect(teks).not.toContain(KODE);
  });

  it("tanpa pengirim sama sekali → pengirim 'belum dikonfigurasi'", async () => {
    const sender = createFallbackOtpSender([], logger());
    expect(sender.name).toBe(createUnavailableOtpSender().name);
    await expect(sender.send(PESAN)).rejects.toBeInstanceOf(OtpSenderError);
  });
});

describe("perakitan dari env", () => {
  const envDasar = {
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
  };
  const twilioLengkap = {
    TWILIO_ACCOUNT_SID: TWILIO.accountSid,
    TWILIO_AUTH_TOKEN: TWILIO.authToken,
    TWILIO_FROM: TWILIO.from,
  };

  it("tanpa provider mana pun → 'belum dikonfigurasi' (deny-by-default)", () => {
    const sender = createOtpSenderFromEnv(loadEnv(envDasar), logger());
    expect(sender.name).toBe("belum-dikonfigurasi");
  });

  it("hanya Fonnte → satu pengirim, tanpa pembungkus rantai", () => {
    const env = loadEnv({ ...envDasar, FONNTE_TOKEN: "t" });
    expect(createOtpSenderFromEnv(env, logger()).name).toBe("fonnte");
  });

  it("hanya Twilio → Twilio menjadi satu-satunya pengirim", () => {
    const env = loadEnv({ ...envDasar, ...twilioLengkap });
    expect(createOtpSenderFromEnv(env, logger()).name).toBe("twilio");
  });

  it("keduanya → urutan Fonnte primer, Twilio cadangan (SDD §8.1)", () => {
    const env = loadEnv({ ...envDasar, FONNTE_TOKEN: "t", ...twilioLengkap });
    expect(createOtpSenderFromEnv(env, logger()).name).toBe("fonnte → twilio");
  });

  it("kredensial Twilio setengah terisi → boot GAGAL dengan nama variabel hilang", () => {
    let err: unknown;
    try {
      loadEnv({ ...envDasar, TWILIO_ACCOUNT_SID: TWILIO.accountSid });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EnvError);
    const nama = (err as EnvError).issues.map(([variabel]) => variabel);
    expect(nama).toContain("TWILIO_AUTH_TOKEN");
    expect(nama).toContain("TWILIO_FROM");
  });

  it("base URL & timeout punya default yang masuk akal", () => {
    const env = loadEnv(envDasar);
    expect(env.FONNTE_BASE_URL).toBe("https://api.fonnte.com");
    expect(env.TWILIO_BASE_URL).toBe("https://api.twilio.com");
    expect(env.OTP_SEND_TIMEOUT_MS).toBe(10_000);
  });
});

describe("alasanAmanUntukLog — keterangan kegagalan yang aman dicatat", () => {
  it("meredaksi nomor HP yang dikutip balik provider", () => {
    const err = new OtpSenderError("fonnte", "invalid target 6289637037236");
    const { alasan } = alasanAmanUntukLog(err);
    expect(alasan).not.toContain("6289637037236");
    expect(alasan).toContain("[angka]");
  });

  it("meredaksi kode OTP bila provider mengutip balik isi pesan", () => {
    // Skenario nyata: provider menolak lalu menyertakan message yang dikirim.
    // Tanpa redaksi, kode masuk log — dan log bertahan jauh lebih lama daripada
    // TTL 5 menit kodenya.
    const err = new OtpSenderError("fonnte", `gagal: ${buildOtpMessage(KODE)}`);
    const { alasan } = alasanAmanUntukLog(err);
    expect(alasan).not.toContain(KODE);
  });

  it("TIDAK meredaksi kode status HTTP — itu keterangan berguna, bukan rahasia", () => {
    const err = new OtpSenderError("fonnte", "Fonnte menolak permintaan (HTTP 502)");
    expect(alasanAmanUntukLog(err).alasan).toBe("Fonnte menolak permintaan (HTTP 502)");
  });

  it("error di luar OtpSenderError dilaporkan sebatas NAMA kelasnya", () => {
    // Pesan Error sembarang bisa memuat URL berparameter atau isi body; tidak
    // satu pun kita kendalikan, jadi tidak satu pun boleh masuk log.
    const err = new TypeError("fetch failed: https://api.fonnte.com/send?target=6289637037236");
    const hasil = alasanAmanUntukLog(err);
    expect(hasil).toEqual({ provider: "tidak diketahui", alasan: "TypeError" });
    expect(JSON.stringify(hasil)).not.toContain("6289637037236");
  });

  it("lemparan yang bukan Error tetap menghasilkan keterangan, bukan crash", () => {
    expect(alasanAmanUntukLog("aneh")).toEqual({
      provider: "tidak diketahui",
      alasan: "kesalahan tidak dikenal",
    });
  });

  it("keterangan panjang dipotong (provider bisa mengembalikan teks besar)", () => {
    const err = new OtpSenderError("fonnte", "x".repeat(500));
    expect(alasanAmanUntukLog(err).alasan).toHaveLength(200);
  });

  it("log rantai fallback tidak memuat nomor maupun kode", async () => {
    const baris: unknown[] = [];
    const logger = { warn: (obj: unknown) => void baris.push(obj) };
    const gagalDenganKutipan: OtpSender = {
      name: "fonnte",
      send: () =>
        Promise.reject(
          new OtpSenderError("fonnte", `tolak target ${PESAN.phone}: ${buildOtpMessage(KODE)}`),
        ),
    };
    const cadangan: OtpSender = { name: "twilio", send: () => Promise.resolve() };

    await createFallbackOtpSender([gagalDenganKutipan, cadangan], logger).send(PESAN);

    // Tanpa baris ini, ketiga assertion di bawah lulus meski logger tidak
    // pernah dipanggil sama sekali — lulus secara hampa.
    // Dua baris, bukan satu: kegagalan fonnte, lalu "terkirim lewat cadangan".
    expect(baris).toHaveLength(2);

    const teks = JSON.stringify(baris);
    expect(teks).not.toContain(KODE);
    expect(teks).not.toContain(PESAN.phone);
    // Tetap berguna: nama provider dan fakta masih ada cadangan tetap tercatat.
    expect(teks).toContain("fonnte");
  });
});
