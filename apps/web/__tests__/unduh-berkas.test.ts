// Penyerahan berkas ke pengguna (PR-033b).
//
// APA YANG DIJAGA BERKAS INI, DAN APA YANG TIDAK.
//
// Dua kehati-hatian di `unduhBerkas` — tautan yang dipasang ke dokumen, dan
// pelepasan URL objek yang ditunda — TIDAK dituntut Chromium: uji mutasi PR-033b
// melepas keduanya satu per satu, dan unduhan di Playwright tetap berhasil.
// Artinya gerbang peramban kita (satu mesin) tidak bisa menjaganya, sementara
// pengguna memakai lebih dari satu mesin.
//
// Karena itu keduanya dijaga DI SINI, sebagai keputusan yang ditulis eksplisit.
// Yang dicegahnya bersifat bisu — tombol ditekan, tidak terjadi apa-apa, tanpa
// satu pun pesan galat — dan kegagalan bisu tidak pernah sampai sebagai laporan
// pengguna; mereka hanya berhenti memakai fiturnya.
import { describe, expect, it, vi } from "vitest";
import { berkasJson, unduhBerkas, type AlatUnduh } from "../src/shared/unduh-berkas.js";

/**
 * Membaca isi Blob. `Blob.text()` belum ada di jsdom versi ini, jadi dipakai
 * FileReader — satu-satunya jalan yang tersedia di sana.
 */
function bacaTeks(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const pembaca = new FileReader();
    pembaca.onload = () => resolve(String(pembaca.result));
    pembaca.onerror = () => reject(pembaca.error);
    pembaca.readAsText(blob);
  });
}

/** Alat palsu yang MEREKAM apa yang terjadi pada tautannya. */
function alatUji() {
  const dibuat: HTMLAnchorElement[] = [];
  const jejak: string[] = [];
  const dilepas: string[] = [];

  const alat: AlatUnduh = {
    createObjectURL: () => "blob:uji-1",
    revokeObjectURL: (url) => {
      dilepas.push(url);
    },
    document: {
      createElement: ((tag: string) => {
        const el = document.createElement(tag) as HTMLAnchorElement;
        if (tag === "a") {
          dibuat.push(el);
          el.click = () => {
            // Bukti bahwa saat DIKLIK ia sudah berada di dalam dokumen —
            // inilah syarat yang kegagalannya bisu.
            jejak.push(el.isConnected ? "klik-tersambung" : "klik-lepas");
          };
        }
        return el;
      }) as Document["createElement"],
      body: document.body,
    },
  };

  return { alat, dibuat, jejak, dilepas };
}

describe("unduhBerkas", () => {
  it("membuat tautan unduhan dengan nama berkas yang diminta", () => {
    const { alat, dibuat } = alatUji();

    unduhBerkas("nawasena-data-saya-2026-01-16.json", berkasJson({ a: 1 }), alat);

    expect(dibuat).toHaveLength(1);
    expect(dibuat[0]?.download).toBe("nawasena-data-saya-2026-01-16.json");
    expect(dibuat[0]?.getAttribute("href")).toBe("blob:uji-1");
  });

  it("mengklik tautan SETELAH ia masuk dokumen", () => {
    const { alat, jejak } = alatUji();

    unduhBerkas("x.json", berkasJson({}), alat);

    expect(jejak).toEqual(["klik-tersambung"]);
  });

  it("membersihkan tautannya dari dokumen sesudah dipakai", () => {
    // Tautan yang tertinggal menumpuk tiap unduhan. Ia `hidden`, jadi tidak
    // terlihat dan tidak akan pernah ada yang melaporkannya.
    const { alat, dibuat } = alatUji();

    unduhBerkas("x.json", berkasJson({}), alat);

    expect(dibuat[0]?.isConnected).toBe(false);
    expect(document.body.querySelectorAll("a")).toHaveLength(0);
  });

  it("tautannya tidak pernah terlihat maupun terfokus", () => {
    const { alat, dibuat } = alatUji();

    unduhBerkas("x.json", berkasJson({}), alat);

    expect(dibuat[0]?.hidden).toBe(true);
  });

  it("melepas URL objek, tetapi TIDAK sebelum unduhannya sempat mulai", async () => {
    // Blob URL menahan seluruh isinya di memori sampai tab ditutup, jadi
    // melepasnya wajib. Melepasnya pada baris tepat setelah `click()` bisa
    // membatalkan unduhan yang baru dimulai — karena itu ditunda satu putaran
    // event loop, dan test ini memeriksa KEDUA sisinya.
    vi.useFakeTimers();
    const { alat, dilepas } = alatUji();

    unduhBerkas("x.json", berkasJson({}), alat);
    expect(dilepas, "dilepas terlalu cepat — unduhan bisa batal").toEqual([]);

    vi.advanceTimersByTime(0);
    expect(dilepas, "URL objek tidak pernah dilepas — kebocoran memori").toEqual(["blob:uji-1"]);
    vi.useRealTimers();
  });
});

describe("berkasJson", () => {
  it("bertipe application/json", async () => {
    const blob = berkasJson({ a: 1 });
    expect(blob.type).toBe("application/json");
  });

  it("berindentasi — berkas ini dibuka ORANG, bukan hanya mesin", async () => {
    // Ekspor PDP dibaca manusia yang ingin tahu data apa yang disimpan
    // tentangnya. JSON satu baris panjang memenuhi kontrak tetapi mengingkari
    // gunanya.
    const isi = await bacaTeks(berkasJson({ a: { b: 1 } }));

    expect(isi).toContain('\n  "a"');
    expect(isi.endsWith("\n"), "berkas teks diakhiri baris baru").toBe(true);
  });
});
