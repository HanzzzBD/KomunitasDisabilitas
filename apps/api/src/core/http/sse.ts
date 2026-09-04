// core/http — helper Server-Sent Events (PR-045, phase-06 L371-436).
//
// Berkas ini TIDAK tahu apa-apa tentang AI. Ia hanya transport: bingkai SSE,
// detak jantung, penyambungan ulang, dan tekanan balik. `core/ai/stream.ts`
// yang menyalurkan token ke sini, dan PR-066 yang memasangnya ke sebuah route.
// Pemisahan ini disengaja — seluruh Acceptance Criteria PR-045 dapat diuji di
// lapisan ini dengan objek respons palsu, tanpa server, tanpa provider, dan
// tanpa jaringan.
//
// KENAPA `id:` ADALAH INTI BERKAS INI, BUKAN HIASAN. AC-1 menuntut "putus →
// sambung tanpa token duplikat ATAU hilang". Dua-duanya, dan yang kedua jauh
// lebih mudah dilanggar tanpa terlihat: implementasi naif menyimpan beberapa
// event terakhir, memutar ulang apa yang kebetulan masih ada, lalu melanjutkan
// — sehingga klien yang putus terlalu lama menerima aliran yang MULUS namun
// BOLONG. Tidak ada error, tidak ada gejala, hanya jawaban AI yang kehilangan
// bagian tengahnya. Karena itu penyangga di bawah bersifat TERBATAS dan
// jujur: bila lompatannya tidak dapat ditutup, sambungan ditolak dengan event
// `error` terstruktur alih-alih dilanjutkan diam-diam. Kehilangan yang
// dilaporkan bisa ditangani produk; kehilangan yang disembunyikan tidak bisa.
//
// BATAS YANG DITERIMA SADAR: penyangga penyambungan hidup DI MEMORI PROSES.
// Dengan dua replika API (SDD §19), penyambungan ulang yang mendarat di proses
// lain tidak akan menemukan sesinya dan menerima `SSE_SESI_TIDAK_DIKENAL`.
// Itu benar dan aman (klien memulai ulang), bukan diam-diam salah. Menjadikan
// penyangga ini lintas-proses menuntut Redis per token — mahal, dan `redis.cache`
// justru boleh meng-evict, yang mengembalikan persoalan bolong yang sama.
// Sampai ada bukti perlu, jalannya adalah sticky routing di PR-098.
import { randomUUID } from "node:crypto";

/**
 * Header yang membuat sebuah respons benar-benar mengalir.
 *
 * `X-Accel-Buffering: no` adalah yang paling mudah terlupakan dan paling mahal
 * akibatnya: tanpa itu nginx menyangga seluruh respons dan MENELAN stream —
 * pengguna melihat layar diam lalu seluruh jawaban muncul sekaligus, yaitu
 * kebalikan persis dari alasan PR ini ada (T7, chat terasa hidup di 3G).
 * Header ini menonaktifkan penyanggaan per-respons, jadi ia tetap benar meski
 * konfigurasi nginx global belum disentuh — AC-5, dan catatan untuk PR-098.
 *
 * `no-transform` melarang proxy perantara memampatkan atau menulis ulang badan
 * respons; kompresi pada stream SSE menahan token sampai buffer kompresor penuh.
 */
export const SSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
});

/** Jeda detak jantung — 15 detik, angka dari spesifikasi PR-045. */
export const SSE_DETAK_MS = 15_000;

/**
 * Kapasitas penyangga penyambungan, dalam JUMLAH EVENT per sesi.
 *
 * Ini sekaligus plafon memori per sesi (AC-3): sebuah sesi tidak akan pernah
 * menahan lebih dari sekian event, seberapa lambat pun kliennya. Angkanya
 * kompromi: cukup panjang untuk menutup putus-sambung 3G yang wajar, cukup
 * pendek untuk membuat seribu sesi menganggur tetap murah.
 */
export const SSE_PENYANGGA_EVENT = 256;

/** Nama event baku. `error` dipakai AC-4; `selesai` menandai akhir normal. */
export const SSE_EVENT_ERROR = "error";
export const SSE_EVENT_SELESAI = "selesai";

/**
 * Irisan `http.ServerResponse` yang benar-benar dipakai helper ini.
 *
 * Sengaja sempit (pola `QuotaRedisLike`/`CacheRedisLike`): `ServerResponse`
 * asli memenuhinya, dan test memakai palsu in-memory — jadi aturan di bawah
 * terbukti tanpa soket, tanpa port, dan tanpa timeout yang rapuh.
 */
export interface SseResponseLike {
  writeHead(status: number, headers: Record<string, string>): void;
  /** `false` = buffer soket penuh; JANGAN menulis lagi sampai `drain`. */
  write(chunk: string): boolean;
  end(): void;
  once(peristiwa: "drain" | "close", cb: () => void): void;
  removeListener?(peristiwa: string, cb: () => void): void;
}

/** Satu event yang sudah bernomor dan siap disimpan/diputar ulang. */
export interface SseEvent {
  readonly id: number;
  readonly event: string | undefined;
  readonly data: string;
}

/**
 * Ubah data menjadi baris-baris `data:`.
 *
 * SSE memperlakukan `\r\n`, `\r`, DAN `\n` sebagai pemisah baris. Memecah hanya
 * pada `\n` meninggalkan `\r` menggantung di ujung baris, dan klien membacanya
 * sebagai pemisah kedua — satu token pecah menjadi dua, atau field berikutnya
 * ikut termakan. Menormalkan ketiganya lebih dulu adalah satu-satunya cara
 * membuat teks model apa pun aman dibingkai.
 */
function barisData(data: string): string {
  return data
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((baris) => `data: ${baris}`)
    .join("\n");
}

/**
 * Bingkai satu event SSE.
 *
 * Nama event divalidasi karena ia masuk ke wire TANPA escaping: sebuah `\n` di
 * dalamnya menyuntikkan field SSE palsu ke aliran — bentuk injeksi yang sama
 * seperti header HTTP, dan nama event bisa berasal dari kode pemanggil yang
 * kelak menerimanya dari luar.
 */
export function bingkaiEvent(e: { id?: number; event?: string; data: string }): string {
  if (e.event !== undefined && /[\r\n]/.test(e.event)) {
    throw new TypeError("Nama event SSE tidak boleh memuat baris baru");
  }
  const bagian: string[] = [];
  if (e.id !== undefined) bagian.push(`id: ${e.id}`);
  if (e.event !== undefined) bagian.push(`event: ${e.event}`);
  bagian.push(barisData(e.data));
  // Baris kosong ganda adalah pemisah event; tanpa itu klien menunggu selamanya.
  return `${bagian.join("\n")}\n\n`;
}

/**
 * Bingkai komentar SSE (baris diawali `:`).
 *
 * Komentar TIDAK memicu event di klien dan TIDAK memajukan `lastEventId` —
 * itulah yang membuatnya tepat untuk detak jantung: ia menahan proxy dan
 * load balancer agar tidak menutup koneksi menganggur, tanpa mengotori aliran
 * token maupun merusak penomoran penyambungan.
 */
export function bingkaiKomentar(teks: string): string {
  return `${teks
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((baris) => `: ${baris}`)
    .join("\n")}\n\n`;
}

/**
 * Penjadwal detak — DISUNTIK, bukan `setInterval` langsung.
 *
 * Aturan repo ini (`core/ai/breaker.ts`, `quota.ts`): jam dan penjadwal
 * disuntik, fake timer TIDAK dipakai. Test memberi penjadwal manual yang
 * dipicu sendiri, jadi aturan detak terbukti tanpa menunggu 15 detik nyata dan
 * tanpa timer palsu yang diam-diam tidak menggerakkan `AbortSignal.timeout`.
 */
export interface PenjadwalSse {
  /** Jalankan `fn` tiap `ms`; kembalikan penghentinya. */
  ulang(fn: () => void, ms: number): () => void;
}

/** Penjadwal baku: `setInterval` yang di-`unref` agar tidak menahan proses. */
export const penjadwalNyata: PenjadwalSse = {
  ulang(fn, ms) {
    const t = setInterval(fn, ms);
    t.unref?.();
    return () => clearInterval(t);
  },
};

/** Kode galat SSE — dikirim sebagai muatan event `error` (AC-4). */
export const SSE_LOMPATAN_TIDAK_TERTUTUP = "SSE_LOMPATAN_TIDAK_TERTUTUP";
export const SSE_SESI_TIDAK_SINKRON = "SSE_SESI_TIDAK_SINKRON";

export interface SseSesiOpsi {
  penjadwal?: PenjadwalSse;
  clock?: () => Date;
  detakMs?: number;
  kapasitas?: number;
}

export interface SseSesi {
  readonly id: string;
  /** Nomor event terakhir yang PERNAH diterbitkan sesi ini. */
  readonly idTerakhir: number;
  readonly terpasang: boolean;
  /**
   * Pasang (atau pasang ulang) sebuah respons. `lastEventId` berasal dari
   * header `Last-Event-Id` klien; `undefined` berarti sambungan baru.
   */
  lampirkan(res: SseResponseLike, lastEventId?: number): Promise<void>;
  /** Terbitkan satu event bernomor. Menunggu bila klien lambat (AC-3). */
  kirim(data: string, event?: string): Promise<void>;
  /** Kirim galat terstruktur lalu tutup (AC-4). */
  galat(kode: string, pesan: string, petunjuk?: string): Promise<void>;
  /** Tutup normal. */
  selesai(): Promise<void>;
}

/**
 * Tunggu sampai soket sanggup menerima lagi.
 *
 * `close` ikut membebaskan penantian dengan sengaja: tanpa itu, klien yang
 * pergi tepat saat buffer penuh membuat produsen menunggu `drain` yang tidak
 * akan pernah datang — satu panggilan AI menggantung selamanya, memegang
 * kuotanya, sampai proses mati.
 */
function tungguLega(res: SseResponseLike): Promise<void> {
  return new Promise((resolve) => {
    let sudah = false;
    const bereskan = (): void => {
      if (sudah) return;
      sudah = true;
      resolve();
    };
    res.once("drain", bereskan);
    res.once("close", bereskan);
  });
}

export function createSseSesi(opsi: SseSesiOpsi = {}): SseSesi {
  const penjadwal = opsi.penjadwal ?? penjadwalNyata;
  const clock = opsi.clock ?? ((): Date => new Date());
  const detakMs = opsi.detakMs ?? SSE_DETAK_MS;
  const kapasitas = Math.max(1, opsi.kapasitas ?? SSE_PENYANGGA_EVENT);
  const id = randomUUID();

  /** Cincin event terakhir — plafon memori sesi ini (AC-3). */
  const cincin: SseEvent[] = [];
  let idTerakhir = 0;
  let res: SseResponseLike | undefined;
  let hentikanDetak: (() => void) | undefined;
  let tulisTerakhirMs = clock().getTime();
  let tertutup = false;

  function lepas(): void {
    res = undefined;
    hentikanDetak?.();
    hentikanDetak = undefined;
  }

  async function tulis(bingkai: string): Promise<void> {
    const kini = res;
    // Tidak ada klien: event tetap MASUK CINCIN (lihat `kirim`) supaya
    // penyambungan ulang bisa memutarnya. Yang dilewati hanya penulisannya.
    if (kini === undefined) return;
    tulisTerakhirMs = clock().getTime();
    if (kini.write(bingkai)) return;
    // AC-3: klien lambat MENAHAN produsen, bukan menumpuk di memori kita.
    await tungguLega(kini);
  }

  function detak(): void {
    if (res === undefined) return;
    if (clock().getTime() - tulisTerakhirMs < detakMs) return;
    // Sengaja tidak lewat `tulis`: detak tidak boleh menunggu `drain`. Klien
    // yang buffernya penuh sudah terbukti hidup — memaksa detak masuk antrean
    // di belakangnya hanya menambah beban tanpa menambah informasi.
    res.write(bingkaiKomentar("detak"));
    tulisTerakhirMs = clock().getTime();
  }

  /**
   * Fungsi bernama, BUKAN `this.galat` — pola yang sama dengan
   * `quota.kembalikan` (`core/ai/quota.ts`) dan untuk alasan yang sama: objek
   * sesi boleh saja di-destructure pemanggilnya, dan `this` yang lepas akan
   * gagal justru di jalur pelaporan galat, yaitu jalur yang paling jarang
   * dijalankan manusia dan paling mahal bila diam.
   */
  async function galat(kode: string, pesan: string, petunjuk?: string): Promise<void> {
    if (tertutup) return;
    tertutup = true;
    // Amplop yang sama dengan error HTTP repo ini ({code,message,hint}),
    // supaya klien tidak perlu dua cara membaca kegagalan.
    const muatan = JSON.stringify({ code: kode, message: pesan, hint: petunjuk ?? "" });
    idTerakhir += 1;
    await tulis(bingkaiEvent({ id: idTerakhir, event: SSE_EVENT_ERROR, data: muatan }));
    res?.end();
    lepas();
  }

  return {
    id,
    get idTerakhir() {
      return idTerakhir;
    },
    get terpasang() {
      return res !== undefined;
    },

    async lampirkan(baru, lastEventId) {
      res = baru;
      baru.writeHead(200, { ...SSE_HEADERS });
      baru.once("close", () => {
        // Hanya lepaskan bila respons INI yang tertutup; sebuah `close` yang
        // datang terlambat dari sambungan lama tidak boleh mencabut yang baru.
        if (res === baru) lepas();
      });
      tulisTerakhirMs = clock().getTime();
      hentikanDetak?.();
      hentikanDetak = penjadwal.ulang(detak, detakMs);

      if (lastEventId === undefined) return;

      if (lastEventId > idTerakhir) {
        // Klien mengaku sudah menerima lebih banyak daripada yang pernah kami
        // terbitkan: sesi yang tertukar atau id basi. Melanjutkan berarti
        // menyembunyikan ketidakcocokan itu.
        await galat(
          SSE_SESI_TIDAK_SINKRON,
          "Sambungan tidak cocok dengan sesi di server",
          "Muat ulang untuk memulai percakapan baru",
        );
        return;
      }

      const tertua = cincin[0]?.id;
      if (lastEventId < idTerakhir && (tertua === undefined || tertua > lastEventId + 1)) {
        // INILAH kasus yang membuat berkas ini ada. Bagian yang hilang sudah
        // ter-evict dari cincin, jadi melanjutkan akan menyajikan aliran mulus
        // yang BOLONG di tengah. Lebih baik gagal terbaca daripada benar-terlihat.
        await galat(
          SSE_LOMPATAN_TIDAK_TERTUTUP,
          "Sebagian jawaban terlewat saat sambungan terputus",
          "Kirim ulang pertanyaan Anda untuk jawaban yang utuh",
        );
        return;
      }

      for (const e of cincin) {
        if (e.id <= lastEventId) continue;
        await tulis(bingkaiEvent(e));
      }
    },

    async kirim(data, event) {
      if (tertutup) return;
      idTerakhir += 1;
      const e: SseEvent = { id: idTerakhir, event, data };
      cincin.push(e);
      // Cincin TERBATAS: inilah yang membuat sesi menganggur tidak tumbuh tanpa
      // batas — dan sekaligus yang menciptakan "lompatan" yang dideteksi di atas.
      if (cincin.length > kapasitas) cincin.shift();
      await tulis(bingkaiEvent(e));
    },

    galat,

    async selesai() {
      if (tertutup) return;
      tertutup = true;
      idTerakhir += 1;
      await tulis(bingkaiEvent({ id: idTerakhir, event: SSE_EVENT_SELESAI, data: "" }));
      res?.end();
      lepas();
    },
  };
}
