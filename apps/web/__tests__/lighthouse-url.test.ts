// Penjaga URL audit Lighthouse (2026-10-01).
//
// Sejak PR-031b/PR-032 kedua config menunjuk `http://localhost/index.html`.
// Alamat itu tidak cocok dengan rute mana pun, jadi yang diaudit selama ini
// adalah HALAMAN 404 — gerbang "perf ≥ 80 pada 3G" lulus atas halaman yang
// tidak pernah dilihat siapa pun, sementara landing sungguhan tertinggal di
// bawah ambang tanpa satu gejala. Penjaga ini memastikan setiap URL audit
// benar-benar jatuh ke rute ber-halaman, bukan ke rute penangkap `*`.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { matchRoutes } from "react-router";
import { ruteApp } from "../src/app/routes.js";

const CONFIG = ["lighthouserc.json", "lighthouserc-3g.json"];

function urlAudit(berkas: string): string[] {
  const akarWeb = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const isi = JSON.parse(readFileSync(resolve(akarWeb, berkas), "utf8")) as { ci: { collect: { url: string[] } } };
  return isi.ci.collect.url;
}

describe("URL audit Lighthouse menunjuk halaman sungguhan", () => {
  for (const berkas of CONFIG) {
    it(`${berkas}: tidak ada URL yang jatuh ke rute 404 (*)`, () => {
      const url = urlAudit(berkas);
      expect(url.length).toBeGreaterThan(0);
      for (const u of url) {
        const cocok = matchRoutes(ruteApp, new URL(u).pathname) ?? [];
        const daun = cocok.at(-1)?.route;
        expect(daun?.path, `${u} jatuh ke rute penangkap 404`).not.toBe("*");
        expect(cocok.length, `${u} tidak cocok dengan rute mana pun`).toBeGreaterThan(0);
      }
    });
  }
});
