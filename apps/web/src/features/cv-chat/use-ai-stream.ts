// `useAiStream` — mesin keadaan satu jawaban pewawancara (PR-068).
//
// fetch-SSE, bukan `EventSource`: token sesi hanya boleh lewat header
// `Authorization` (lihat `@nawasena/api-client/sse`). Hook ini menafsirkan event
// yang diserahkan `streamAiChat` / `resumeAiChatStream`:
//
//   giliran (user)      → giliran tersimpan; "pewawancara sedang mengetik"
//   token               → pratinjau bertambah; kalimat utuh diumumkan
//   giliran (assistant) → pratinjau DIGANTI isi tersimpan (versi rapi server)
//   selesai / error     → aliran tutup
//
// PUTUS ≠ GAGAL. Aliran yang berakhir TANPA event penutup (3G putus, tab
// dibekukan) disambung ulang dengan `Last-Event-Id` — hingga tiga kali,
// berjeda 1/2/4 detik. Server tetap membuat jawabannya meski klien pergi (PR-066),
// jadi yang dijaga di sini hanyalah menyambung kembali ke aliran yang sama.
// Bila server menjawab 404 (aliran sudah lewat masa simpannya), jawabannya SUDAH
// tersimpan di transkrip: pemanggil diminta memuat ulang sesi, bukan diberi
// galat.
//
// FOKUS TIDAK PERNAH DIPINDAH oleh hook ini. Pengumuman lewat `aria-live`
// (dirender halaman), kotak ketik tetap memegang fokus — syarat AC "giliran AI
// terbaca otomatis oleh NVDA tanpa mencuri fokus input".
import { useCallback, useEffect, useRef, useState } from "react";
import { aiChatTurnSchema, aiCvChatErrorEventSchema, type AiChatTurn } from "@nawasena/schemas";
import {
  ApiError,
  resumeAiChatStream,
  streamAiChat,
  type ApiClient,
  type EventSse,
} from "@nawasena/api-client";
import { createPenampungKalimat } from "./kalimat.js";

export type StatusAliran = "diam" | "mengirim" | "mengetik" | "menyambung";

/** Kegagalan yang dilihat pengguna. `degraded` = beralih ke formulir (ADR-005). */
export interface GalatAliran {
  kode: string;
  pesan: string;
  petunjuk: string;
  degraded: boolean;
  retryAfterSeconds?: number;
}

/** Satu pengumuman untuk wilayah `aria-live`; `id` menjaga urutan & kunci React. */
export interface Pengumuman {
  id: number;
  teks: string;
}

/**
 * Kode penolakan PRA-ALIRAN yang berarti "chat tidak bisa dipakai sekarang" —
 * halaman beralih ke formulir di tempat (keputusan owner 2026-09-28).
 */
const KODE_DEGRADASI = new Set(["KUOTA_AI_HABIS", "AI_CHAT_DIMATIKAN", "AI_CHAT_SIBUK"]);

/** Berapa kali menyambung ulang sebelum menyerah — jeda 1, 2, 4 detik. */
export const MAKS_SAMBUNG_ULANG = 3;

export interface OpsiAiStream {
  klien: ApiClient;
  sessionId: string | null;
  /** Giliran tersimpan (pengguna atau asisten) — halaman menambahkannya ke transkrip. */
  onGiliran(turn: AiChatTurn): void;
  /** Aliran tak bisa disambung lagi; jawabannya ada di transkrip server. */
  onPerluMuatUlang(): void;
  /** Teks pengumuman saat pewawancara mulai menjawab (sudah diterjemahkan). */
  teksMengetik: string;
  /** Disuntik test — jeda sambung ulang tanpa menunggu detik nyata. */
  tunda?: (ms: number) => Promise<void>;
}

export interface HasilAiStream {
  status: StatusAliran;
  /** Pratinjau jawaban yang sedang mengalir (teks mentah, dirender sebagai teks). */
  draf: string;
  galat: GalatAliran | null;
  pengumuman: readonly Pengumuman[];
  kirim(pesan: string): Promise<void>;
  hapusGalat(): void;
}

const tundaNyata = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function galatDari(err: unknown): GalatAliran {
  if (err instanceof ApiError) {
    return {
      kode: err.code,
      pesan: err.message,
      petunjuk: err.hint ?? "",
      degraded: KODE_DEGRADASI.has(err.code),
    };
  }
  return {
    kode: "JARINGAN_GAGAL",
    pesan: "Tidak dapat terhubung ke server",
    petunjuk: "Periksa koneksi internet Anda, lalu coba lagi",
    degraded: false,
  };
}

export function useAiStream(opsi: OpsiAiStream): HasilAiStream {
  const [status, setStatus] = useState<StatusAliran>("diam");
  const [draf, setDraf] = useState("");
  const [galat, setGalat] = useState<GalatAliran | null>(null);
  const [pengumuman, setPengumuman] = useState<Pengumuman[]>([]);
  const opsiRef = useRef(opsi);
  opsiRef.current = opsi;
  const nomor = useRef(0);
  const batal = useRef<AbortController | null>(null);

  useEffect(() => () => batal.current?.abort(), []);

  const umumkan = useCallback((teks: readonly string[]) => {
    if (teks.length === 0) return;
    setPengumuman((lama) => [
      ...lama,
      ...teks.map((t) => {
        nomor.current += 1;
        return { id: nomor.current, teks: t };
      }),
    ]);
  }, []);

  const kirim = useCallback(
    async (pesan: string) => {
      const { klien, sessionId } = opsiRef.current;
      if (sessionId === null) return;
      const tunda = opsiRef.current.tunda ?? tundaNyata;
      batal.current?.abort();
      const pengendali = new AbortController();
      batal.current = pengendali;

      setGalat(null);
      setDraf("");
      // Wilayah live dikosongkan per giliran: pengumuman lama tidak dibaca ulang.
      setPengumuman([]);
      setStatus("mengirim");

      const penampung = createPenampungKalimat();
      let idTerakhir = 0;
      let tertutup = false;

      /** Tafsirkan satu event; true = aliran sudah ditutup server. */
      const tangani = (e: EventSse): boolean => {
        if (e.id !== undefined) idTerakhir = e.id;
        switch (e.event) {
          case "giliran": {
            const turn = aiChatTurnSchema.parse(JSON.parse(e.data));
            opsiRef.current.onGiliran(turn);
            if (turn.role === "user") {
              setStatus("mengetik");
              umumkan([opsiRef.current.teksMengetik]);
            } else {
              const sisa = penampung.tuntaskan();
              umumkan(sisa === null ? [] : [sisa]);
              setDraf("");
            }
            return false;
          }
          case "token":
            setDraf((d) => d + e.data);
            umumkan(penampung.tambah(e.data));
            return false;
          case "error": {
            const muatan = aiCvChatErrorEventSchema.safeParse(JSON.parse(e.data));
            setGalat(
              muatan.success
                ? {
                    kode: muatan.data.code,
                    pesan: muatan.data.message,
                    petunjuk: muatan.data.hint,
                    degraded: muatan.data.degraded === true,
                    ...(muatan.data.retryAfterSeconds === undefined
                      ? {}
                      : { retryAfterSeconds: muatan.data.retryAfterSeconds }),
                  }
                : galatDari(undefined),
            );
            setDraf("");
            return true;
          }
          case "selesai":
            return true;
          default:
            return false;
        }
      };

      let aliran: AsyncIterable<EventSse>;
      try {
        aliran = await streamAiChat(klien, { sessionId, message: pesan }, pengendali.signal);
      } catch (err) {
        if (pengendali.signal.aborted) return;
        setGalat(galatDari(err));
        setStatus("diam");
        return;
      }

      for (let percobaan = 0; ; percobaan += 1) {
        try {
          for await (const e of aliran) {
            if (tangani(e)) {
              tertutup = true;
              break;
            }
          }
        } catch {
          // Soket putus di tengah pembacaan — perlakukan sama dengan aliran
          // yang berakhir tanpa penutup: sambung ulang.
        }
        if (tertutup || pengendali.signal.aborted) break;

        if (percobaan >= MAKS_SAMBUNG_ULANG) {
          setGalat({
            kode: "JARINGAN_GAGAL",
            pesan: "Sambungan terputus sebelum jawaban selesai",
            petunjuk: "Periksa internet Anda. Percakapan tersimpan — muat ulang untuk melihatnya",
            degraded: false,
          });
          break;
        }
        setStatus("menyambung");
        await tunda(1000 * 2 ** percobaan);
        if (pengendali.signal.aborted) return;
        try {
          aliran = await resumeAiChatStream(klien, sessionId, idTerakhir, pengendali.signal);
          setStatus("mengetik");
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            // Aliran sudah lewat masa simpannya — jawabannya di transkrip.
            setDraf("");
            opsiRef.current.onPerluMuatUlang();
            break;
          }
          // Masih tak terjangkau: putaran berikutnya mencoba lagi.
          aliran = (async function* kosong() {})();
        }
      }
      if (!pengendali.signal.aborted) setStatus("diam");
    },
    [umumkan],
  );

  return {
    status,
    draf,
    galat,
    pengumuman,
    kirim,
    hapusGalat: useCallback(() => setGalat(null), []),
  };
}
