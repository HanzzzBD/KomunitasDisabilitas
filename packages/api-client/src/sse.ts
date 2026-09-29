// Pengurai Server-Sent Events untuk klien (PR-068).
//
// KENAPA BUKAN `EventSource`. `EventSource` bawaan browser tidak bisa mengirim
// header — padahal token sesi WAJIB lewat `Authorization`, tidak pernah di query
// string (URL berakhir di log akses dan proxy; log PR-045). Jadi klien membaca
// respons `fetch` sendiri, dan berkas inilah pembacanya.
//
// BEBAS DOM, sama seperti seluruh paket ini: hanya `ReadableStream` +
// `TextDecoder`, yang tersedia di browser, React Native (Hermes, dengan polyfill
// stream), dan Node ≥ 18. Klien mobile memakai pengurai yang SAMA.
//
// Aturan pembingkaian mengikuti pengurai sisi server (`core/ai/stream.ts`):
// potongan jaringan TIDAK sejajar dengan bingkai, jadi ada penyangga sisa; `\r\n`
// dan `\r` dinormalkan; satu spasi sesudah titik dua dibuang; baris komentar
// (`: detak`) dilewati tanpa memajukan apa pun.

/** Satu event SSE yang sudah utuh. */
export interface EventSse {
  /** Nomor event dari `id:` — dasar `Last-Event-Id` saat menyambung ulang. */
  id?: number;
  /** Nama event dari `event:`; absen = event bawaan `message`. */
  event?: string;
  data: string;
}

/** Irisan `ReadableStream<Uint8Array>` yang dipakai — `Response.body` memenuhinya. */
export interface AliranByte {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock(): void;
  };
}

function uraiBingkai(bingkai: string): EventSse | undefined {
  const data: string[] = [];
  let id: number | undefined;
  let event: string | undefined;
  for (const baris of bingkai.split("\n")) {
    if (baris === "" || baris.startsWith(":")) continue;
    const titikDua = baris.indexOf(":");
    const kunci = titikDua === -1 ? baris : baris.slice(0, titikDua);
    let nilai = titikDua === -1 ? "" : baris.slice(titikDua + 1);
    if (nilai.startsWith(" ")) nilai = nilai.slice(1);
    if (kunci === "data") data.push(nilai);
    else if (kunci === "event") event = nilai;
    else if (kunci === "id" && /^\d+$/.test(nilai)) id = Number(nilai);
  }
  // Bingkai tanpa `data:` (mis. hanya komentar) bukan event.
  if (data.length === 0) return undefined;
  return {
    ...(id === undefined ? {} : { id }),
    ...(event === undefined ? {} : { event }),
    data: data.join("\n"),
  };
}

/**
 * Urai aliran byte menjadi event SSE, berurutan.
 *
 * Aliran yang berakhir tanpa baris kosong penutup tetap menyerahkan bingkai
 * terakhirnya — sama seperti pengurai server. Pemanggil yang perlu tahu apakah
 * aliran berakhir NORMAL membaca event penutupnya sendiri (`selesai`/`error`);
 * berkas ini tidak menafsirkan nama event apa pun.
 */
export async function* uraiSse(aliran: AliranByte): AsyncGenerator<EventSse> {
  const reader = aliran.getReader();
  const dekoder = new TextDecoder();
  let sisa = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sisa += dekoder.decode(value ?? new Uint8Array(), { stream: true });
      sisa = sisa.replace(/\r\n?/g, "\n");
      let batas = sisa.indexOf("\n\n");
      while (batas !== -1) {
        const e = uraiBingkai(sisa.slice(0, batas));
        sisa = sisa.slice(batas + 2);
        if (e !== undefined) yield e;
        batas = sisa.indexOf("\n\n");
      }
    }
    const ekor = uraiBingkai(sisa);
    if (ekor !== undefined) yield ekor;
  } finally {
    reader.releaseLock();
  }
}
