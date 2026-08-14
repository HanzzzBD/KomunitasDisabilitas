// @vitest-environment node
//
// Berkas ini BERJALAN DI NODE, bukan jsdom seperti test lain di folder ini.
// Sebabnya bukan selera: mengimpor `vite.config.ts` ikut menarik esbuild, dan
// esbuild menolak berjalan di jsdom (`TextEncoder` jsdom bukan `Uint8Array`
// sungguhan) dengan galat yang menuduh lingkungannya rusak. Membaca konfigurasi
// sebagai TEKS akan menghindari itu, tetapi lalu yang diuji adalah tulisannya,
// bukan nilai yang benar-benar dibaca Vite.
//
// Proxy API untuk server dev (PR-034).
//
// KENAPA KONFIGURASI INI PUNYA PENJAGA. Ia tidak dipakai satu pun test lain,
// tidak ikut `vite build`, dan tidak menghasilkan galat bila hilang — server
// dev hanya menjawab permintaan API dengan HTML fallback SPA. Yang terlihat
// pengembang lalu bukan "proxy hilang", melainkan "JSON tidak bisa diparse"
// atau "selalu terlempar ke halaman masuk", dan keduanya menunjuk ke arah yang
// sama sekali salah.
//
// Konfigurasi yang kegagalannya menyesatkan seperti itu tidak boleh bergantung
// pada ingatan siapa pun.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import konfigurasi from "../vite.config.js";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AKAR = resolve(WEB, "..", "..");

/** Bagian `server.proxy` seperti yang benar-benar dibaca Vite. */
const proxy = konfigurasi.server?.proxy ?? {};
const PREFIX = "/api/v1";
const entri = proxy[PREFIX];

function baca(jalur: string): string {
  return readFileSync(resolve(AKAR, jalur), "utf8");
}

describe("proxy dev ada dan menunjuk API", () => {
  it("prefix /api/v1 diproxy", () => {
    expect(entri, "server.proxy['/api/v1'] hilang dari vite.config.ts").toBeDefined();
  });

  it("menunjuk API lokal, bukan alamat lain", () => {
    expect(typeof entri === "object" ? entri.target : entri).toBe("http://localhost:3000");
  });

  it("TIDAK menulis ulang jalur", () => {
    // API melayani di bawah `/api/v1`. `rewrite` yang memotong prefix akan
    // membuat setiap endpoint menjadi 404 — dan 404 dari API terlihat persis
    // sama dengan 404 karena endpoint memang belum ada.
    expect(typeof entri === "object" ? entri.rewrite : undefined).toBeUndefined();
  });
});

describe("proxy tidak menabrak jalur lain", () => {
  it("tidak ada route aplikasi yang berada di bawah prefix proxy", () => {
    // Route yang jatuh di bawah `/api/v1` tidak akan pernah sampai ke React —
    // ia diteruskan ke API, yang menjawabnya dengan JSON. Halamannya lenyap
    // tanpa satu pun galat.
    const rute = baca("apps/web/src/app/routes.ts");
    const jalur = [...rute.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1] ?? "");

    expect(jalur.length, "tidak menemukan satu pun `path:` — pola guard ini basi").toBeGreaterThan(
      0,
    );
    for (const j of jalur) {
      expect(`/${j}`.startsWith(PREFIX), `route "${j}" berada di bawah prefix proxy`).toBe(false);
    }
  });

  it("prefix-nya cukup sempit untuk tidak menyentuh aset dev", () => {
    // Vite melayani modul & aset di `/src`, `/@vite`, `/@fs`, `/node_modules`,
    // dan `/assets`. Prefix yang terlalu longgar (mis. `/a`) akan menelan
    // sebagiannya dan mematikan server dev tanpa pesan yang menyebut sebabnya.
    for (const milikVite of ["/src", "/@vite", "/@fs", "/node_modules", "/assets", "/"]) {
      expect(milikVite.startsWith(PREFIX), `${milikVite} tertelan proxy`).toBe(false);
    }
  });
});

describe("proxy cocok dengan yang benar-benar dipanggil aplikasi", () => {
  it("prefix-nya sama dengan baseUrl klien API", () => {
    // Dua string literal di dua berkas. Bila salah satunya bergeser, proxy
    // meneruskan jalur yang tidak pernah dipanggil siapa pun — dan aplikasinya
    // memanggil jalur yang tidak pernah diproxy.
    const klien = baca("apps/web/src/app/klien-api.tsx");
    expect(
      klien.includes(`"${PREFIX}"`),
      "baseUrl bawaan di klien-api.tsx bukan lagi /api/v1 — proxy ikut harus berubah",
    ).toBe(true);
  });

  it("cookie refresh berada DI BAWAH prefix proxy", () => {
    // Inilah yang membuat sesi bekerja di dev. Cookie ber-`Path=/api/v1/auth`
    // hanya ikut terkirim pada jalur di bawah path itu; bila path cookie kelak
    // dipindah ke luar prefix proxy, pemulihan sesi berhenti bekerja di dev
    // sementara test unit tetap hijau seluruhnya.
    const cookie = baca("apps/api/src/modules/auth/controllers/session-cookie.ts");
    const cocok = /COOKIE_PATH = "([^"]+)"/.exec(cookie);

    expect(cocok?.[1], "COOKIE_PATH tidak terbaca — pola guard ini basi").toBeDefined();
    expect(
      (cocok?.[1] ?? "").startsWith(PREFIX),
      `Path cookie ${cocok?.[1]} berada di luar prefix proxy ${PREFIX}`,
    ).toBe(true);
  });

  it("port target sama dengan PORT bawaan API", () => {
    // Angka yang sama ditulis di dua tempat. Yang menggesernya di satu sisi
    // saja mendapat 502 dari server dev, tanpa petunjuk bahwa sebabnya ada di
    // berkas lain.
    const contoh = baca("apps/api/.env.example");
    const port = /^PORT=(\d+)$/m.exec(contoh)?.[1];

    expect(port, "PORT tidak terbaca dari apps/api/.env.example").toBeDefined();
    expect(typeof entri === "object" ? entri.target : entri).toBe(`http://localhost:${port ?? ""}`);
  });
});
