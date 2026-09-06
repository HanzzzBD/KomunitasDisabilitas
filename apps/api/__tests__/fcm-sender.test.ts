// Unit adapter FCM HTTP v1 (PR-048b) — klasifikasi galat, cache access token,
// dan satu jaminan yang tidak boleh pernah dilanggar: token perangkat tidak
// pernah bocor ke pesan galat.
//
// `fetch` di-inject, bukan di-mock global: repo ini tidak punya msw/nock, dan
// DI `FetchLike` membuat setiap cabang provider bisa diuji tanpa dependensi
// baru — pola yang sama dengan `fonnte.sender` dan adapter Gemini.
import { describe, it, expect, vi } from "vitest";
import { generateKeyPair, exportPKCS8 } from "jose";
import {
  createFcmSender,
  createFcmSenderFromEnv,
  createUnavailableFcmSender,
  FcmError,
} from "../src/modules/notifications/index.js";
import type { FetchLike } from "../src/modules/auth/services/fonnte.sender.js";

const TOKEN_PERANGKAT = "token-perangkat-sangat-rahasia-001";

/** Kunci RS256 nyata — `importPKCS8` menolak PEM karangan. */
async function kunciUji(): Promise<string> {
  const { privateKey } = await generateKeyPair("RS256");
  return exportPKCS8(privateKey);
}

function jawaban(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const TOKEN_OK = { access_token: "akses-1", expires_in: 3600 };

async function rakit(
  urutan: Array<(url: string) => Response | Promise<Response>>,
): Promise<{ sender: ReturnType<typeof createFcmSender>; panggilan: string[]; fetch: FetchLike }> {
  const panggilan: string[] = [];
  let ke = 0;
  const fetch = vi.fn(async (url: string) => {
    panggilan.push(url);
    const langkah = urutan[Math.min(ke, urutan.length - 1)];
    ke += 1;
    return langkah === undefined ? jawaban(500, {}) : await langkah(url);
  });

  const sender = createFcmSender(
    {
      projectId: "nawasena-uji",
      clientEmail: "push@nawasena-uji.iam.gserviceaccount.com",
      privateKey: await kunciUji(),
      timeoutMs: 5_000,
      tokenUrl: "https://oauth.uji/token",
      baseUrl: "https://fcm.uji",
    },
    fetch as unknown as FetchLike,
  );

  return { sender, panggilan, fetch: fetch as unknown as FetchLike };
}

const pesan = { fcmToken: TOKEN_PERANGKAT, title: "Judul", body: "Isi", data: { a: "1" } };

describe("penukaran access token (OAuth2 service account)", () => {
  it("menukar JWT lebih dulu, lalu mengirim ke FCM", async () => {
    const { sender, panggilan } = await rakit([
      () => jawaban(200, TOKEN_OK),
      () => jawaban(200, { name: "projects/x/messages/1" }),
    ]);

    await expect(sender.kirim(pesan)).resolves.toEqual({ hasil: "terkirim" });
    expect(panggilan[0]).toBe("https://oauth.uji/token");
    expect(panggilan[1]).toBe("https://fcm.uji/v1/projects/nawasena-uji/messages:send");
  });

  it("access token DI-CACHE — pengiriman kedua tidak menukar ulang", async () => {
    // Satu peristiwa bisa melahirkan beberapa push (multi-device). Menukar JWT
    // per perangkat berarti satu panggilan jaringan tambahan tiap kali, dan
    // Google memang membatasi laju endpoint token itu.
    const { sender, panggilan } = await rakit([
      () => jawaban(200, TOKEN_OK),
      () => jawaban(200, {}),
      () => jawaban(200, {}),
    ]);

    await sender.kirim(pesan);
    await sender.kirim(pesan);

    expect(panggilan.filter((u) => u.includes("/token"))).toHaveLength(1);
  });

  it("kredensial ditolak → FCM_KREDENSIAL_TIDAK_VALID, bukan galat generik", async () => {
    const { sender } = await rakit([() => jawaban(401, { error: "invalid_grant" })]);

    await expect(sender.kirim(pesan)).rejects.toMatchObject({
      name: "FcmError",
      code: "FCM_KREDENSIAL_TIDAK_VALID",
    });
  });

  it("kunci privat cacat gagal SEBELUM menyentuh jaringan", async () => {
    const fetch = vi.fn();
    const sender = createFcmSender(
      {
        projectId: "x",
        clientEmail: "a@b.c",
        privateKey: "-----BEGIN PRIVATE KEY-----\nbukan-kunci\n-----END PRIVATE KEY-----",
        timeoutMs: 1000,
      },
      fetch as unknown as FetchLike,
    );

    await expect(sender.kirim(pesan)).rejects.toMatchObject({
      code: "FCM_KREDENSIAL_TIDAK_VALID",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("klasifikasi jawaban FCM", () => {
  it.each([
    ["404 tanpa kode", 404, {}],
    ["400 UNREGISTERED", 400, { error: { status: "UNREGISTERED" } }],
    ["400 INVALID_ARGUMENT", 400, { error: { status: "INVALID_ARGUMENT" } }],
    ["403 NOT_FOUND", 403, { error: { status: "NOT_FOUND" } }],
  ])("%s → token-mati (bukan exception)", async (_nama, status, body) => {
    // Token mati BUKAN kegagalan: ia jawaban sah yang menuntut pembersihan.
    // Menjadikannya exception memaksa pemanggil membedakan "ulangi" dari
    // "bersihkan" lewat pemeriksaan tipe error — perbedaan sepenting itu
    // pantas ada di tipe nilai balik.
    const { sender } = await rakit([() => jawaban(200, TOKEN_OK), () => jawaban(status, body)]);

    const hasil = await sender.kirim(pesan);
    expect(hasil.hasil).toBe("token-mati");
  });

  it.each([
    ["429", 429, "FCM_RATE_LIMIT"],
    ["500", 500, "FCM_TIDAK_TERSEDIA"],
    ["503", 503, "FCM_TIDAK_TERSEDIA"],
  ])("%s → dilempar supaya BullMQ mengulang", async (_nama, status, code) => {
    const { sender } = await rakit([() => jawaban(200, TOKEN_OK), () => jawaban(status, {})]);

    await expect(sender.kirim(pesan)).rejects.toMatchObject({ code });
  });

  it("401 saat mengirim membuang cache token, lalu menukar ulang", async () => {
    // 401 juga muncul saat token kebetulan hangus lebih cepat daripada dugaan
    // kita. Membiarkan cache-nya berarti setiap percobaan berikutnya memakai
    // token yang sudah pasti ditolak.
    const { sender, panggilan } = await rakit([
      () => jawaban(200, TOKEN_OK),
      () => jawaban(401, { error: { status: "UNAUTHENTICATED" } }),
      () => jawaban(200, TOKEN_OK),
      () => jawaban(200, {}),
    ]);

    await expect(sender.kirim(pesan)).rejects.toMatchObject({
      code: "FCM_KREDENSIAL_TIDAK_VALID",
    });
    await expect(sender.kirim(pesan)).resolves.toEqual({ hasil: "terkirim" });

    expect(panggilan.filter((u) => u.includes("/token"))).toHaveLength(2);
  });

  it("timeout → FCM_TIMEOUT, galat jaringan → FCM_JARINGAN", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const { sender } = await rakit([
      () => jawaban(200, TOKEN_OK),
      () => {
        throw timeout;
      },
    ]);
    await expect(sender.kirim(pesan)).rejects.toMatchObject({ code: "FCM_TIMEOUT" });

    const lain = await rakit([
      () => jawaban(200, TOKEN_OK),
      () => {
        throw new Error("ECONNRESET");
      },
    ]);
    await expect(lain.sender.kirim(pesan)).rejects.toMatchObject({ code: "FCM_JARINGAN" });
  });
});

describe("token perangkat tidak pernah bocor", () => {
  it("tidak muncul di pesan galat mana pun", async () => {
    // Token perangkat bukan PII, tetapi siapa pun yang memegangnya bisa
    // mengirim notifikasi ke layar kunci perangkat seseorang. Pesan galat
    // adalah tempat paling mudah ia menyelinap ke log.
    const kasus: Array<[number, unknown]> = [
      [429, {}],
      [500, {}],
      [401, { error: { status: "UNAUTHENTICATED" } }],
    ];

    for (const [status, body] of kasus) {
      const { sender } = await rakit([() => jawaban(200, TOKEN_OK), () => jawaban(status, body)]);
      const err = await sender.kirim(pesan).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(FcmError);
      expect(JSON.stringify({ m: (err as Error).message })).not.toContain(TOKEN_PERANGKAT);
    }
  });
});

describe("adapter tanpa kredensial", () => {
  it("createFcmSenderFromEnv tanpa env → tidak tersedia, boot TIDAK gagal", () => {
    const sender = createFcmSenderFromEnv({});

    expect(sender.tersedia).toBe(false);
  });

  it.each([
    ["hanya projectId", { FCM_PROJECT_ID: "x" }],
    ["kurang privateKey", { FCM_PROJECT_ID: "x", FCM_CLIENT_EMAIL: "a@b.c" }],
  ])("%s → tetap tidak tersedia", (_nama, env) => {
    // Gerbang env (superRefine) sudah menolak grup yang setengah terisi saat
    // boot; ini lapisan keduanya, untuk pemanggil yang merakit env sendiri.
    expect(createFcmSenderFromEnv(env).tersedia).toBe(false);
  });

  it("setiap panggilan menolak dengan kode yang bisa dibedakan", async () => {
    await expect(createUnavailableFcmSender().kirim(pesan)).rejects.toMatchObject({
      code: "FCM_TIDAK_DIKONFIGURASI",
    });
  });
});
