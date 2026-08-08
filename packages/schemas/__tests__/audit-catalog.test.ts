// Penjaga sinkronisasi katalog audit (audit dokumen 2026-08-07).
//
// KENAPA ADA. `AUTH_LOGIN_SUCCEEDED` (PR-017) dan `AUTH_REFRESH_REUSED`
// (PR-018) hidup di kode selama beberapa PR tanpa pernah masuk
// `docs/audit-action-catalog.md`. Dokumen itu adalah kontrak yang dibaca saat
// investigasi keamanan — aksi yang tidak tercatat di sana berarti orang yang
// sedang menyelidiki insiden tidak tahu bahwa sinyalnya ada.
//
// Typecheck sudah memaksa setiap aksi punya skema meta (`auditMetaSchemas`
// bertipe Record<AuditAction, …>). Yang belum dijaga apa pun adalah dokumennya.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUDIT_ACTION, auditMetaSchemas, type AuditAction } from "../src/audit.js";

const katalog = readFileSync(
  resolve(__dirname, "../../../docs/audit-action-catalog.md"),
  "utf8",
);

/** Nama action yang muncul sebagai `` `NAMA` `` di kolom pertama tabel. */
const diDokumen = new Set(
  [...katalog.matchAll(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/gm)].map((m) => m[1] as string),
);

const semuaAction = Object.values(AUDIT_ACTION) as AuditAction[];

describe("docs/audit-action-catalog.md — sinkron dengan AUDIT_ACTION", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    // Regex tabel yang tidak cocok lagi (mis. format dokumen berubah) akan
    // membuat `diDokumen` kosong dan test "action asing" hijau tanpa memeriksa.
    expect(diDokumen.size).toBeGreaterThan(5);
    expect(semuaAction.length).toBeGreaterThan(5);
  });

  it("setiap action punya baris di katalog", () => {
    const hilang = semuaAction.filter((a) => !diDokumen.has(a));
    expect(hilang, `Action berikut belum ada di docs/audit-action-catalog.md: ${hilang.join(", ")}`).toEqual(
      [],
    );
  });

  it("katalog tidak memuat action yang sudah tidak ada di kode", () => {
    const asing = [...diDokumen].filter((a) => !semuaAction.includes(a as AuditAction));
    expect(asing).toEqual([]);
  });

  it("setiap key meta yang diizinkan disebut di kolom 'Meta aman'", () => {
    // Kolom itu yang dibaca penulis PR saat memutuskan apa yang boleh dicatat.
    // Key yang ada di skema tetapi tidak di dokumen = izin tersembunyi.
    const tidakDisebut: string[] = [];
    for (const action of semuaAction) {
      const baris = katalog.split("\n").find((l) => l.includes(`\`${action}\``)) ?? "";
      for (const key of Object.keys(auditMetaSchemas[action].shape)) {
        if (!baris.includes(`\`${key}\``)) tidakDisebut.push(`${action}.${key}`);
      }
    }
    expect(tidakDisebut).toEqual([]);
  });
});
