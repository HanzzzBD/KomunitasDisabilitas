// modules/notifications — adapter FCM HTTP v1 (PR-048b, SDD §16 `notify:push`).
//
// `fetch` mentah + `jose`, BUKAN `firebase-admin`. Pola yang sama dengan
// `google-token.ts` dan `fonnte.sender.ts`, dan alasannya sama: repo ini tidak
// punya infrastruktur mock HTTP (tidak ada msw/nock), sedangkan DI `FetchLike`
// membuat setiap cabang galat provider bisa diuji tanpa dependensi baru. SDK
// vendor juga membawa transitive dependency yang jauh lebih besar daripada satu
// panggilan REST yang bentuknya sudah stabil bertahun-tahun.
//
// HTTP v1, bukan API legacy: legacy ("server key") sudah dimatikan Google, dan
// v1 menuntut bearer OAuth2 yang ditukar dari JWT service account — itulah
// seluruh isi `ambilAccessToken` di bawah.
//
// SATU ATURAN YANG MENGIKAT SELURUH BERKAS: token perangkat TIDAK PERNAH masuk
// log, pesan galat, maupun nilai balik. Ia bukan PII, tetapi siapa pun yang
// memegangnya bisa mengirim notifikasi ke layar kunci perangkat seseorang —
// dokumen phase menuntutnya diperlakukan rahasia. Yang boleh dicatat hanyalah
// AKIBATNYA (terkirim / mati / gagal), bukan identitasnya.
import { SignJWT, importPKCS8 } from "jose";
import type { NotificationText } from "@nawasena/schemas";
import type { FetchLike } from "../../auth/services/fonnte.sender.js";

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  /** PEM PKCS#8. Pemisah baris sudah dipulihkan pemanggil. */
  privateKey: string;
  timeoutMs: number;
  /** Diganti hanya untuk test. */
  tokenUrl?: string;
  baseUrl?: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const BASE_URL = "https://fcm.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/**
 * Hasil satu pengiriman. `token-mati` BUKAN kegagalan — ia jawaban sah yang
 * menuntut tindakan (hapus barisnya), dan menjadikannya exception akan memaksa
 * pemanggil membedakan "gagal yang perlu diulang" dari "gagal yang perlu
 * dibersihkan" lewat pemeriksaan tipe error. Perbedaan sepenting itu pantas ada
 * di tipe nilai balik, bukan di dalam catch.
 */
export type HasilKirim = { hasil: "terkirim" } | { hasil: "token-mati"; alasan: string };

/** Kegagalan yang PANTAS diulang BullMQ. */
export class FcmError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, pesan: string, status?: number) {
    super(pesan);
    this.name = "FcmError";
    this.code = code;
    this.status = status;
  }
}

export interface PesanPush {
  fcmToken: string;
  title: string;
  body: string;
  /** Referensi untuk deep link klien (PR-094). Hanya id/enum. */
  data: Record<string, string>;
}

export interface FcmSender {
  readonly tersedia: boolean;
  kirim(pesan: PesanPush): Promise<HasilKirim>;
}

/**
 * Kode galat FCM yang berarti TOKENNYA yang salah, bukan permintaannya.
 *
 * `UNREGISTERED` = aplikasi dihapus atau token di-refresh; `INVALID_ARGUMENT`
 * pada field token = token cacat. Keduanya tidak akan pernah berhasil bila
 * diulang, jadi mengulangnya hanya membakar percobaan dan menunda pembersihan.
 */
const TOKEN_MATI = new Set(["UNREGISTERED", "INVALID_ARGUMENT", "NOT_FOUND"]);

interface FcmErrorBody {
  error?: { status?: unknown; message?: unknown; code?: unknown };
}

/** Kode status FCM dari body; aman untuk log — ia jenis kegagalan, bukan isi. */
function bacaKode(body: unknown): string {
  if (typeof body !== "object" || body === null) return "TIDAK_DIKETAHUI";
  const status = (body as FcmErrorBody).error?.status;
  return typeof status === "string" && status.trim() !== "" ? status.trim() : "TIDAK_DIKETAHUI";
}

/**
 * Adapter yang setiap panggilannya menjawab "tidak dikonfigurasi".
 *
 * Boot TIDAK PERNAH gagal karena kredensial FCM yang belum ada — pola yang sama
 * dengan `createUnavailableOtpSender` dan `createAiGateway` tanpa kunci. Push
 * adalah kanal tambahan; mematikan seluruh worker karena ia belum disetel akan
 * ikut mematikan purge PDP dan retensi, yang tidak ada hubungannya.
 */
export function createUnavailableFcmSender(): FcmSender {
  return {
    tersedia: false,
    kirim() {
      return Promise.reject(new FcmError("FCM_TIDAK_DIKONFIGURASI", "Kredensial FCM belum diatur"));
    },
  };
}

export function createFcmSender(config: FcmConfig, fetchImpl?: FetchLike): FcmSender {
  const panggil: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  const tokenUrl = config.tokenUrl ?? TOKEN_URL;
  const baseUrl = config.baseUrl ?? BASE_URL;

  /**
   * Access token beserta waktu hangusnya, DI MEMORI PROSES.
   *
   * Di-cache karena token OAuth berlaku ~1 jam sedangkan satu peristiwa bisa
   * melahirkan beberapa push: menukar JWT untuk setiap perangkat berarti satu
   * panggilan jaringan tambahan per perangkat, dan Google memang membatasi laju
   * endpoint token itu.
   *
   * TIDAK di Redis, dan itu disengaja: token ini kredensial, dan menaruhnya di
   * instans cache yang berjalan `allkeys-lru` (ADR-004) berarti menaruh
   * kredensial di tempat yang bisa dibaca proses lain sekaligus bisa hilang
   * kapan saja. Biaya menyimpannya per-proses hanyalah satu penukaran tambahan
   * per proses per jam.
   */
  let cache: { token: string; hangusPada: number } | null = null;

  async function ambilAccessToken(): Promise<string> {
    // 60 detik sebelum hangus sudah dianggap hangus: token yang masih sah saat
    // dikirim tetapi hangus saat tiba akan menjadi 401 yang terlihat seperti
    // kredensial salah — kegagalan yang jauh lebih membingungkan daripada satu
    // penukaran ekstra.
    if (cache !== null && Date.now() < cache.hangusPada - 60_000) return cache.token;

    const sekarang = Math.floor(Date.now() / 1000);
    let assertion: string;
    try {
      const kunci = await importPKCS8(config.privateKey, "RS256");
      assertion = await new SignJWT({ scope: SCOPE })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(config.clientEmail)
        .setSubject(config.clientEmail)
        .setAudience(tokenUrl)
        .setIssuedAt(sekarang)
        .setExpirationTime(sekarang + 3600)
        .sign(kunci);
    } catch (err) {
      // Kunci yang tidak bisa dibaca TIDAK akan membaik bila diulang. Ditandai
      // begitu supaya processor bisa berhenti alih-alih menghabiskan keempat
      // percobaannya pada kesalahan konfigurasi.
      throw new FcmError(
        "FCM_KREDENSIAL_TIDAK_VALID",
        `Kunci privat FCM tidak bisa dipakai: ${err instanceof Error ? err.name : "tidak diketahui"}`,
      );
    }

    const res = await panggil(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!res.ok) {
      throw new FcmError(
        res.status === 400 || res.status === 401
          ? "FCM_KREDENSIAL_TIDAK_VALID"
          : "FCM_TOKEN_GAGAL",
        `Penukaran token FCM gagal (HTTP ${res.status})`,
        res.status,
      );
    }

    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || body.access_token === "") {
      throw new FcmError("FCM_TOKEN_GAGAL", "Penukaran token FCM tidak mengembalikan access_token");
    }

    const berlaku = typeof body.expires_in === "number" ? body.expires_in : 3600;
    cache = { token: body.access_token, hangusPada: Date.now() + berlaku * 1000 };
    return cache.token;
  }

  return {
    tersedia: true,

    async kirim(pesan) {
      const accessToken = await ambilAccessToken();

      let res: Response;
      try {
        res = await panggil(`${baseUrl}/v1/projects/${config.projectId}/messages:send`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: pesan.fcmToken,
              // `notification` (bukan hanya `data`): dengan blok ini sistem
              // operasi menampilkan notifikasinya sendiri meski aplikasi
              // tertutup — dan "kabar sampai walau app tertutup" adalah seluruh
              // alasan PR ini ada (Objective dokumen phase).
              notification: { title: pesan.title, body: pesan.body },
              data: pesan.data,
            },
          }),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (err) {
        // Abort = timeout; sisanya galat jaringan. Keduanya PANTAS diulang.
        const timeout = err instanceof Error && err.name === "TimeoutError";
        throw new FcmError(
          timeout ? "FCM_TIMEOUT" : "FCM_JARINGAN",
          timeout ? "FCM tidak menjawab tepat waktu" : "Gagal menghubungi FCM",
        );
      }

      if (res.ok) return { hasil: "terkirim" };

      const body: unknown = await res.json().catch(() => null);
      const kode = bacaKode(body);

      // 404 = token tidak dikenal FCM. 400 dengan kode di TOKEN_MATI = tokennya
      // yang cacat, bukan permintaannya.
      if (res.status === 404 || (res.status === 400 && TOKEN_MATI.has(kode))) {
        return { hasil: "token-mati", alasan: kode };
      }
      if (res.status === 403 && TOKEN_MATI.has(kode)) {
        return { hasil: "token-mati", alasan: kode };
      }

      if (res.status === 401 || res.status === 403) {
        // Kredensial ditolak. Token cache dibuang supaya percobaan berikutnya
        // menukar yang baru — 401 juga muncul saat token kebetulan hangus lebih
        // cepat daripada dugaan kita.
        cache = null;
        throw new FcmError("FCM_KREDENSIAL_TIDAK_VALID", `FCM menolak kredensial (${kode})`, res.status);
      }

      throw new FcmError(
        res.status === 429 ? "FCM_RATE_LIMIT" : "FCM_TIDAK_TERSEDIA",
        `FCM gagal (HTTP ${res.status}, ${kode})`,
        res.status,
      );
    },
  };
}

/**
 * Rakit adapter dari env, atau adapter "tidak tersedia" bila kredensialnya
 * kosong. `\n` literal di env dipulihkan menjadi pemisah baris sungguhan —
 * tanpa itu `importPKCS8` menolak PEM-nya dengan pesan yang tidak menyebut
 * sebabnya.
 */
export function createFcmSenderFromEnv(
  env: {
    FCM_PROJECT_ID?: string;
    FCM_CLIENT_EMAIL?: string;
    FCM_PRIVATE_KEY?: string;
  },
  opsi: { timeoutMs?: number } = {},
): FcmSender {
  const { FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY } = env;
  if (
    FCM_PROJECT_ID === undefined ||
    FCM_CLIENT_EMAIL === undefined ||
    FCM_PRIVATE_KEY === undefined
  ) {
    return createUnavailableFcmSender();
  }

  return createFcmSender({
    projectId: FCM_PROJECT_ID,
    clientEmail: FCM_CLIENT_EMAIL,
    privateKey: FCM_PRIVATE_KEY.replace(/\\n/g, "\n"),
    // 15 detik = timeout queue `notify-push` (SDD §16). Disamakan dengan
    // sengaja: adapter yang lebih sabar daripada job-nya akan selalu dipotong
    // di tengah, dan yang terlihat adalah job timeout tanpa sebab.
    timeoutMs: opsi.timeoutMs ?? 15_000,
  });
}

/** Rakit teks push dari kedua varian bahasa. */
export function pilihVarian(teks: NotificationText, sederhana: boolean): string {
  return sederhana ? teks["id-simple"] : teks.id;
}
