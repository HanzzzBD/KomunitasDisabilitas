// Helper SSE — PR-045, AC-1..AC-5 (phase-06 L430-436).
//
// Seluruh berkas ini berjalan TANPA server, TANPA soket, dan TANPA timer nyata.
// Itu bukan kenyamanan: aturan yang diuji di sini (penyambungan ulang, detak,
// tekanan balik) adalah aturan yang di test berbasis jaringan hanya bisa
// dibuktikan dengan menunggu — dan test yang menunggu adalah test yang
// akhirnya di-skip. Respons palsu + penjadwal manual + jam suntik membuat
// semuanya deterministik.
import { describe, it, expect } from "vitest";
import {
  bingkaiEvent,
  bingkaiKomentar,
  createSseSesi,
  SSE_EVENT_ERROR,
  SSE_EVENT_SELESAI,
  SSE_HEADERS,
  SSE_LOMPATAN_TIDAK_TERTUTUP,
  SSE_SESI_TIDAK_SINKRON,
  type PenjadwalSse,
  type SseResponseLike,
} from "../src/core/http/sse.js";

/** Respons palsu: mencatat tulisan, bisa dibuat "penuh", bisa dipicu drain/close. */
function resPalsu() {
  const tulisan: string[] = [];
  const pendengar = new Map<string, Array<() => void>>();
  let kepala: { status: number; headers: Record<string, string> } | undefined;
  let penuh = false;
  let berakhir = false;

  const res: SseResponseLike = {
    writeHead(status, headers) {
      kepala = { status, headers };
    },
    write(chunk) {
      tulisan.push(chunk);
      // `false` = buffer soket penuh; inilah sinyal tekanan balik yang nyata.
      return !penuh;
    },
    end() {
      berakhir = true;
    },
    once(peristiwa, cb) {
      const daftar = pendengar.get(peristiwa) ?? [];
      daftar.push(cb);
      pendengar.set(peristiwa, daftar);
    },
  };

  return {
    res,
    teks: () => tulisan.join(""),
    tulisan,
    kepala: () => kepala,
    berakhir: () => berakhir,
    jadikanPenuh: (nilai: boolean) => {
      penuh = nilai;
    },
    picu: (peristiwa: "drain" | "close") => {
      const daftar = pendengar.get(peristiwa) ?? [];
      pendengar.set(peristiwa, []);
      for (const cb of daftar) cb();
    },
  };
}

/** Penjadwal manual — pengganti `setInterval`, dipicu test, bukan waktu. */
function penjadwalManual() {
  const tugas: Array<{ fn: () => void }> = [];
  const penjadwal: PenjadwalSse = {
    ulang(fn) {
      const t = { fn };
      tugas.push(t);
      return () => {
        const i = tugas.indexOf(t);
        if (i >= 0) tugas.splice(i, 1);
      };
    },
  };
  return { penjadwal, detak: () => tugas.forEach((t) => t.fn()), jumlah: () => tugas.length };
}

/** Jam yang digeser test — pola repo (`breaker.ts`, `quota.ts`), bukan fake timer. */
function jamManual(mulai = 0) {
  let ms = mulai;
  return { clock: (): Date => new Date(ms), maju: (delta: number) => (ms += delta) };
}

describe("bingkai event (unit encoder)", () => {
  it("menyusun id, event, data, dan diakhiri baris kosong ganda", () => {
    expect(bingkaiEvent({ id: 7, event: "token", data: "halo" })).toBe(
      "id: 7\nevent: token\ndata: halo\n\n",
    );
  });

  it("data multi-baris menjadi BEBERAPA baris `data:`", () => {
    // Satu `data:` yang memuat `\n` mentah akan dibaca klien sebagai akhir
    // field — token pecah, atau field berikutnya ikut termakan.
    expect(bingkaiEvent({ id: 1, data: "a\nb" })).toBe("id: 1\ndata: a\ndata: b\n\n");
  });

  it("CRLF dan CR tunggal dinormalkan — bukan hanya LF", () => {
    // Kasus yang paling mudah lolos review: memecah hanya pada `\n`
    // meninggalkan `\r` menggantung, dan klien membacanya sebagai pemisah kedua.
    const hasil = bingkaiEvent({ id: 2, data: "a\r\nb\rc" });
    expect(hasil).toBe("id: 2\ndata: a\ndata: b\ndata: c\n\n");
    expect(hasil).not.toContain("\r");
  });

  it("nama event ber-baris-baru DITOLAK — ia menyuntik field SSE palsu", () => {
    expect(() => bingkaiEvent({ event: "a\nid: 99", data: "x" })).toThrow(TypeError);
  });

  it("data kosong tetap menghasilkan satu baris `data:`", () => {
    expect(bingkaiEvent({ id: 3, data: "" })).toBe("id: 3\ndata: \n\n");
  });

  it("komentar diawali titik dua dan tidak membawa field apa pun", () => {
    expect(bingkaiKomentar("detak")).toBe(": detak\n\n");
  });
});

describe("AC-5 — header yang membuat respons benar-benar mengalir", () => {
  it("menulis 200 beserta header anti-penyanggaan", async () => {
    const p = resPalsu();
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    await sesi.lampirkan(p.res);

    expect(p.kepala()?.status).toBe(200);
    // `X-Accel-Buffering: no` adalah yang menonaktifkan penyanggaan nginx
    // per-respons; tanpa ini proxy menelan stream dan seluruh PR sia-sia.
    expect(p.kepala()?.headers["X-Accel-Buffering"]).toBe("no");
    expect(p.kepala()?.headers["Content-Type"]).toContain("text/event-stream");
    // `no-transform` melarang proxy memampatkan badan — kompresi menahan token.
    expect(p.kepala()?.headers["Cache-Control"]).toContain("no-transform");
    expect(SSE_HEADERS["Connection"]).toBe("keep-alive");
  });
});

describe("AC-2 — detak jantung 15 detik saat menganggur", () => {
  it("mengirim komentar detak setelah diam melewati ambang", async () => {
    const p = resPalsu();
    const jam = jamManual();
    const j = penjadwalManual();
    const sesi = createSseSesi({ penjadwal: j.penjadwal, clock: jam.clock, detakMs: 15_000 });
    await sesi.lampirkan(p.res);

    jam.maju(15_000);
    j.detak();

    expect(p.teks()).toContain(": detak");
    // Detak TIDAK boleh memajukan penomoran: ia bukan event, dan menaikkan id
    // di sini akan membuat penyambungan ulang meminta event yang tak pernah ada.
    expect(sesi.idTerakhir).toBe(0);
  });

  it("TIDAK berdetak bila baru saja ada tulisan — anti-hampa", async () => {
    // Tanpa test ini, implementasi yang mengirim detak SETIAP tick juga lulus
    // test di atas, dan aliran token yang ramai jadi penuh komentar.
    const p = resPalsu();
    const jam = jamManual();
    const j = penjadwalManual();
    const sesi = createSseSesi({ penjadwal: j.penjadwal, clock: jam.clock, detakMs: 15_000 });
    await sesi.lampirkan(p.res);

    jam.maju(14_999);
    j.detak();

    expect(p.teks()).not.toContain(": detak");
  });

  it("berhenti berdetak setelah koneksi tertutup", async () => {
    const p = resPalsu();
    const j = penjadwalManual();
    const sesi = createSseSesi({ penjadwal: j.penjadwal });
    await sesi.lampirkan(p.res);
    expect(j.jumlah()).toBe(1);

    p.picu("close");

    expect(j.jumlah()).toBe(0);
    expect(sesi.terpasang).toBe(false);
  });
});

describe("AC-3 — tekanan balik: klien lambat tidak menumpuk memori", () => {
  it("MENAHAN produsen sampai soket lega, bukan menulis terus", async () => {
    const p = resPalsu();
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    await sesi.lampirkan(p.res);
    p.jadikanPenuh(true);

    let usai = false;
    const janji = sesi.kirim("a", "token").then(() => {
      usai = true;
    });
    // Dua putaran microtask: cukup untuk membuktikan ia benar-benar menunggu,
    // bukan sekadar belum sempat dijadwalkan.
    await Promise.resolve();
    await Promise.resolve();
    expect(usai).toBe(false);

    p.picu("drain");
    await janji;
    expect(usai).toBe(true);
  });

  it("klien yang PERGI saat buffer penuh tidak menggantung produsen selamanya", async () => {
    // Tanpa `close` sebagai pembebas, satu panggilan AI menunggu `drain` yang
    // tak akan pernah datang — memegang kuotanya sampai proses mati.
    const p = resPalsu();
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    await sesi.lampirkan(p.res);
    p.jadikanPenuh(true);

    const janji = sesi.kirim("a", "token");
    p.picu("close");

    await expect(janji).resolves.toBeUndefined();
  });

  it("cincin event TERBATAS — itulah plafon memori satu sesi", async () => {
    // Dibuktikan lewat perilaku, bukan lewat properti internal: dengan
    // kapasitas 2 dan 4 event terkirim, event ke-2 sudah ter-evict, sehingga
    // sambung-ulang dari id 1 tidak lagi bisa ditutup.
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal, kapasitas: 2 });
    const a = resPalsu();
    await sesi.lampirkan(a.res);
    for (const t of ["1", "2", "3", "4"]) await sesi.kirim(t, "token");
    a.picu("close");

    const b = resPalsu();
    await sesi.lampirkan(b.res, 1);

    expect(b.teks()).toContain(SSE_LOMPATAN_TIDAK_TERTUTUP);
  });
});

describe("AC-1 — putus lalu sambung: tanpa duplikat DAN tanpa hilang", () => {
  it("memutar ulang PERSIS event yang terlewat, berurutan, sekali saja", async () => {
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    const a = resPalsu();
    await sesi.lampirkan(a.res);
    await sesi.kirim("satu", "token");
    await sesi.kirim("dua", "token");
    await sesi.kirim("tiga", "token");
    a.picu("close");

    const b = resPalsu();
    await sesi.lampirkan(b.res, 1);
    const t = b.teks();

    // Tidak hilang: yang belum diterima klien memang dikirim ulang.
    expect(t).toContain("data: dua");
    expect(t).toContain("data: tiga");
    // Tidak duplikat: yang sudah diterima TIDAK dikirim lagi.
    expect(t).not.toContain("data: satu");
    expect(t).not.toContain("id: 1\n");
    // Berurutan — aliran token yang tertukar urutannya sama rusaknya.
    expect(t.indexOf("dua")).toBeLessThan(t.indexOf("tiga"));
  });

  it("sambungan BARU (tanpa Last-Event-Id) tidak memutar ulang apa pun", async () => {
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    const a = resPalsu();
    await sesi.lampirkan(a.res);
    await sesi.kirim("satu", "token");
    a.picu("close");

    const b = resPalsu();
    await sesi.lampirkan(b.res);

    expect(b.teks()).not.toContain("data: satu");
  });

  it("klien yang sudah mutakhir tidak menerima kiriman ulang", async () => {
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    const a = resPalsu();
    await sesi.lampirkan(a.res);
    await sesi.kirim("satu", "token");
    a.picu("close");

    const b = resPalsu();
    await sesi.lampirkan(b.res, 1);

    expect(b.teks()).not.toContain("data: satu");
    expect(b.teks()).not.toContain(SSE_EVENT_ERROR);
  });

  it("lompatan yang TIDAK bisa ditutup dilaporkan — bukan disambung diam-diam", async () => {
    // INI alasan berkas `sse.ts` ada. Implementasi naif memutar ulang apa yang
    // kebetulan masih tersimpan dan melanjutkan; klien menerima jawaban yang
    // MULUS namun BOLONG di tengah, tanpa satu pun gejala.
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal, kapasitas: 2 });
    const a = resPalsu();
    await sesi.lampirkan(a.res);
    for (const t of ["1", "2", "3", "4"]) await sesi.kirim(t, "token");
    a.picu("close");

    const b = resPalsu();
    await sesi.lampirkan(b.res, 1);
    const t = b.teks();

    expect(t).toContain(`event: ${SSE_EVENT_ERROR}`);
    expect(t).toContain(SSE_LOMPATAN_TIDAK_TERTUTUP);
    // Yang paling penting: sisa yang masih ada TIDAK disajikan seolah utuh.
    expect(t).not.toContain("data: 3");
    expect(t).not.toContain("data: 4");
    expect(b.berakhir()).toBe(true);
  });

  it("klien yang mengaku lebih maju dari server ditolak sebagai tidak sinkron", async () => {
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    const a = resPalsu();
    await sesi.lampirkan(a.res);
    await sesi.kirim("satu", "token");
    a.picu("close");

    const b = resPalsu();
    await sesi.lampirkan(b.res, 99);

    expect(b.teks()).toContain(SSE_SESI_TIDAK_SINKRON);
    expect(b.berakhir()).toBe(true);
  });
});

describe("AC-4 — galat mid-stream sebagai event terstruktur", () => {
  it("mengirim event error ber-amplop {code,message,hint} lalu menutup", async () => {
    const p = resPalsu();
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    await sesi.lampirkan(p.res);
    await sesi.kirim("sebagian", "token");
    await sesi.galat("AI_TIMEOUT", "Jawaban AI terhenti di tengah jalan", "Coba kirim ulang");

    const t = p.teks();
    expect(t).toContain(`event: ${SSE_EVENT_ERROR}`);
    const baris = t.split("\n").find((b) => b.startsWith("data: {"));
    expect(baris).toBeDefined();
    expect(JSON.parse((baris as string).slice(6))).toEqual({
      code: "AI_TIMEOUT",
      message: "Jawaban AI terhenti di tengah jalan",
      hint: "Coba kirim ulang",
    });
    expect(p.berakhir()).toBe(true);
  });

  it("sesudah galat, sesi tidak menulis apa pun lagi", async () => {
    const p = resPalsu();
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    await sesi.lampirkan(p.res);
    await sesi.galat("AI_TIMEOUT", "gagal");
    const sebelum = p.teks();

    await sesi.kirim("tidak boleh muncul", "token");
    await sesi.selesai();

    expect(p.teks()).toBe(sebelum);
  });

  it("penutupan normal menandai selesai", async () => {
    const p = resPalsu();
    const sesi = createSseSesi({ penjadwal: penjadwalManual().penjadwal });
    await sesi.lampirkan(p.res);
    await sesi.selesai();

    expect(p.teks()).toContain(`event: ${SSE_EVENT_SELESAI}`);
    expect(p.berakhir()).toBe(true);
  });
});
