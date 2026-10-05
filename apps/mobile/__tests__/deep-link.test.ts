// Validasi deep link (PR-088): tautan dari luar aplikasi hanya diteruskan bila
// skemanya milik kita dan path-nya ada di daftar yang diizinkan.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { deepLinkDiizinkan, pathDeepLink, SKEMA } from "../src/navigation/deep-link";

describe("pathDeepLink", () => {
  it.each([
    ["nawasena://", ""],
    ["nawasena:///", ""],
    ["nawasena://beranda", "beranda"],
    ["nawasena://beranda/", "beranda"],
    ["nawasena:///beranda", "beranda"],
    ["nawasena://beranda?utm=wa", "beranda"],
    ["nawasena://beranda#atas", "beranda"],
    ["NAWASENA://beranda", "beranda"],
  ])("menerima %s", (url, path) => {
    expect(pathDeepLink(url)).toBe(path);
  });

  it.each([
    ["skema lain", "https://nawasena.id/beranda"],
    ["skema mirip", "nawasena-evil://beranda"],
    ["skema mirip tanpa pemisah", "nawasenax://beranda"],
    ["path tak terdaftar", "nawasena://admin"],
    ["traversal", "nawasena://beranda/../admin"],
    ["persen-encoding", "nawasena://ber%61nda"],
    ["kredensial/host", "nawasena://user@beranda"],
    ["huruf besar di path", "nawasena://Beranda"],
    ["javascript:", "javascript:alert(1)"],
    ["kosong", ""],
    ["terlalu panjang", `nawasena://beranda?x=${"a".repeat(600)}`],
  ])("menolak %s", (_, url) => {
    expect(pathDeepLink(url)).toBeNull();
    expect(deepLinkDiizinkan(url)).toBe(false);
  });
});

describe("skema konsisten", () => {
  it("app.config.ts mendaftarkan skema yang sama dengan validator", () => {
    const config = readFileSync(join(__dirname, "..", "app.config.ts"), "utf8");
    expect(config).toContain(`scheme: "${SKEMA}"`);
  });
});
