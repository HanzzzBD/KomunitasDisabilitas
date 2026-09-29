// modules/ai — percakapan AI CV Builder (PR-066, PRD FR-3.1, SDD §7.3).
//
// DUA FASE, DAN BATASNYA ADALAH HEADER HTTP.
//   `siapkan` — semua yang bisa ditolak SEBELUM aliran dibuka: fitur mati,
//               sesi tidak ada/milik orang lain, sesi selesai, jawaban lain
//               masih mengalir, server penuh. Ditolak sebagai error HTTP biasa
//               (JSON), karena header belum terkirim.
//   `jalankan` — sesudah header SSE terkirim. Di sini TIDAK ADA lemparan: setiap
//               kegagalan menjadi event `error` terstruktur, sebab errorHandler
//               Express tidak bisa lagi menulis apa pun ke respons ini.
//
// KUOTA HABIS DIKIRIM SEBAGAI EVENT (keputusan owner 2026-09-28), bukan 429
// sebelum aliran: klien PR-068 cukup punya satu cara membaca kegagalan chat.
// Pemeriksaan kuotanya sendiri tetap milik `AiClient.stream` — modul ini tidak
// pernah menyentuh penghitung.
//
// ALIRAN TIDAK IKUT MATI SAAT KLIEN PERGI. Jawaban tetap dibuat sampai selesai
// dan tersimpan di transkrip; event-nya menumpuk di cincin sesi SSE untuk klien
// yang menyambung ulang. Itulah seluruh isi AC "putus → resume tanpa kehilangan
// giliran": yang dijamin bukan koneksinya, melainkan gilirannya.
import type { AiChatSession, AiChatTurn, AiCvChatRequest } from "@nawasena/schemas";
import {
  AiProviderError,
  DegradedError,
  isKuotaHabis,
  type AiClient,
  type PercakapanTemplate,
} from "../../../core/ai/index.js";
import { AppError, appError, createSseSesi, type SseSesi } from "../../../core/http/index.js";
import type { Logger } from "../../../core/logger/index.js";
import type { RegistriAliran } from "./cv-chat-aliran.js";
import type { AiChatActor, AiChatSessionsService } from "./chat-sessions.service.js";

/** Nama event — dibaca klien PR-068; lihat kepala blok cv-chat di `@nawasena/schemas`. */
export const EVENT_GILIRAN = "giliran";
export const EVENT_TOKEN = "token";

/** Satu jawaban yang siap dialirkan: sesi SSE-nya, dan pekerjaan yang mengisinya. */
export interface AliranCvChat {
  sesi: SseSesi;
  /** TIDAK PERNAH menolak — lihat kepala berkas. */
  jalankan(): Promise<void>;
}

export interface CvChatServiceDeps {
  chatSessions: AiChatSessionsService;
  ai: Pick<AiClient, "stream">;
  registri: RegistriAliran;
  template: PercakapanTemplate;
  /** `env.AI_CV_CHAT_ENABLED` — tuas rollback. */
  aktif: boolean;
  logger: Pick<Logger, "error">;
  /** Pembuat sesi SSE; disuntik test (penjadwal manual). */
  buatSesiSse?: () => SseSesi;
}

export interface CvChatService {
  /** Sesi aktif pemanggil; sesi BARU langsung berisi salam pembuka (tanpa AI). */
  mulai(actor: AiChatActor): Promise<{ session: AiChatSession; baru: boolean }>;
  /** Pemeriksaan pra-aliran. Melempar `AppError` — masih boleh dijawab JSON. */
  siapkan(actor: AiChatActor, input: AiCvChatRequest): Promise<AliranCvChat>;
  /** Aliran yang masih bisa disambung; 404 `AI_ALIRAN_TIDAK_ADA` bila tidak. */
  sambungUlang(actor: AiChatActor, sessionId: string): SseSesi;
}

/**
 * Terjemahkan kegagalan jadi muatan event `error`.
 *
 * `adaToken` menentukan arti kegagalan provider: SEBELUM token pertama berarti
 * AI tidak tersedia sama sekali (router sudah mencoba cadangan) — pengguna
 * dialihkan ke formulir (`degraded`). SESUDAH token pertama berarti jawaban
 * terpotong — pengguna cukup mengirim ulang.
 */
function keGalat(
  err: unknown,
  adaToken: boolean,
): { kode: string; pesan: string; petunjuk: string; tambahan?: Record<string, unknown> } {
  if (isKuotaHabis(err) && err instanceof AppError) {
    return {
      kode: err.code,
      pesan: err.message,
      petunjuk: err.hint ?? "",
      tambahan: {
        degraded: true,
        ...(err.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: err.retryAfterSeconds }),
      },
    };
  }
  if (err instanceof AiProviderError) {
    if (err.code === "AI_SAFETY_BLOCK") {
      // BUKAN degradasi: permintaannya sendiri yang ditolak. Mengalihkan ke
      // formulir akan terbaca seolah-olah AI rusak.
      return {
        kode: err.code,
        pesan: "Pesan ini tidak bisa dijawab oleh AI",
        petunjuk: "Coba tulis dengan kalimat lain, atau lanjutkan lewat formulir CV",
      };
    }
    if (adaToken) {
      return {
        kode: err.code,
        pesan: "Jawaban AI terhenti di tengah jalan",
        petunjuk: "Kirim ulang pesan Anda. Percakapan sebelumnya tetap tersimpan",
      };
    }
    return {
      kode: err.code,
      pesan: "Chat AI sedang tidak tersedia",
      petunjuk: "Lanjutkan lewat formulir CV biasa. Percakapan Anda tetap tersimpan",
      tambahan: { degraded: true },
    };
  }
  if (err instanceof AppError) {
    return { kode: err.code, pesan: err.message, petunjuk: err.hint ?? "" };
  }
  const baku = appError("TERJADI_KESALAHAN");
  return { kode: baku.code, pesan: baku.message, petunjuk: baku.hint ?? "" };
}

export function createCvChatService(deps: CvChatServiceDeps): CvChatService {
  const { chatSessions, ai, registri, template, logger } = deps;
  const buatSesiSse = deps.buatSesiSse ?? (() => createSseSesi());

  function pastikanAktif(): void {
    if (!deps.aktif) throw new DegradedError("AI_CHAT_DIMATIKAN");
  }

  async function kirimGiliran(sesi: SseSesi, turn: AiChatTurn): Promise<void> {
    await sesi.kirim(JSON.stringify(turn), EVENT_GILIRAN);
  }

  async function jalankan(
    actor: AiChatActor,
    sessionId: string,
    pesan: string,
    sesi: SseSesi,
  ): Promise<void> {
    let adaToken = false;
    try {
      // 1. Pesan pengguna disimpan DULU, sebelum AI dipanggil. Kalau AI gagal
      //    (kuota, provider), yang ditulis pengguna tidak hilang — ekstraksi
      //    PR-067 tetap membacanya.
      await kirimGiliran(
        sesi,
        await chatSessions.tambahGiliran(actor, sessionId, { role: "user", content: pesan }),
      );

      // 2. Riwayat dibaca SETELAH giliran pengguna tersimpan — dari DB, bukan
      //    dari memori, supaya urutannya sama persis dengan yang diekstrak kelak.
      const { turns } = await chatSessions.get(actor, sessionId);
      const permintaan = template.bangun(turns.map((t) => ({ role: t.role, content: t.content })));

      // 3. Kuota diperiksa di sini (melempar sebelum aliran provider dibuka).
      const aliran = await ai.stream(
        { userId: actor.userId, feature: "cv_chat", promptVersion: template.id },
        permintaan,
      );

      let mentah = "";
      for await (const potongan of aliran) {
        adaToken = true;
        mentah += potongan;
        await sesi.kirim(potongan, EVENT_TOKEN);
      }

      // 4. Yang DISIMPAN adalah versi rapi — sama bentuknya dari Gemini maupun
      //    Groq. Potongan `token` di atas hanya pratinjau; klien mengganti
      //    teksnya dengan isi event `giliran` di bawah.
      const rapi = template.rapikan(mentah);
      if (rapi === "") throw new AiProviderError("AI_INVALID_OUTPUT", "cv-chat");
      await kirimGiliran(
        sesi,
        await chatSessions.tambahGiliran(actor, sessionId, { role: "assistant", content: rapi }),
      );
      await sesi.selesai();
    } catch (err) {
      const g = keGalat(err, adaToken);
      if (g.kode === "TERJADI_KESALAHAN") {
        // Hanya yang TAK TERDUGA yang dicatat sebagai error; kuota habis dan
        // provider tumbang adalah keadaan yang sudah punya jalurnya sendiri.
        logger.error({ err, sessionId }, "Percakapan AI CV Builder gagal tanpa sebab yang dikenal");
      }
      await sesi.galat(g.kode, g.pesan, g.petunjuk, g.tambahan);
    } finally {
      registri.selesai(sessionId, sesi);
    }
  }

  return {
    async mulai(actor) {
      pastikanAktif();
      const { session, baru } = await chatSessions.mulaiAtauLanjutkan(actor);
      if (!baru) return { session, baru };
      // Hanya pemanggil yang MELAHIRKAN sesi yang menulis salam — unique parsial
      // PR-065 menjamin hanya satu, jadi dua "mulai" serentak tidak menggandakannya.
      await chatSessions.tambahGiliran(actor, session.id, {
        role: "assistant",
        content: template.salamPembuka,
      });
      return { session: await chatSessions.get(actor, session.id), baru };
    },

    async siapkan(actor, input) {
      pastikanAktif();
      const session = await chatSessions.get(actor, input.sessionId); // 404 bila bukan miliknya
      if (session.status === "finalizing") throw appError("AI_SESI_SEDANG_DIFINALISASI");
      if (session.status !== "active") throw appError("AI_SESI_SUDAH_SELESAI");

      const sesi = buatSesiSse();
      const daftar = registri.daftar(session.id, actor.userId, sesi);
      if (daftar === "sedang-berjalan") throw appError("AI_SEDANG_MENJAWAB");
      if (daftar === "penuh") throw new DegradedError("AI_CHAT_SIBUK");

      return { sesi, jalankan: () => jalankan(actor, session.id, input.message, sesi) };
    },

    sambungUlang(actor, sessionId) {
      const sesi = registri.ambil(sessionId, actor.userId);
      if (sesi === undefined) throw appError("AI_ALIRAN_TIDAK_ADA");
      return sesi;
    },
  };
}
