// Penjaga kesepadanan KONTRAK ↔ SKEMA untuk notifikasi (PR-047).
//
// `applicationStatusSchema` di packages/schemas menyalin enum
// `ApplicationStatus` dari schema.prisma, dan salinan itu tidak bisa dihindari:
// paket schemas dipakai web dan mobile, yang tidak punya `@prisma/client` dan
// tidak boleh punya. Yang bisa dihindari adalah salinannya MENYIMPANG diam-diam.
//
// Kalau menyimpang, akibatnya nyata dan tidak berisik: status baru yang lahir di
// Prisma tanpa label di `LABEL_STATUS` akan membuat notifikasinya gagal dirender
// bagi pengguna yang lamarannya sampai ke status itu — dan hanya bagi mereka.
// Kegagalan yang menimpa sebagian kecil pengguna adalah kegagalan yang paling
// lama tidak terdeteksi.
import { describe, it, expect } from "vitest";
import {
  applicationStatusSchema,
  devicePlatformSchema,
  notificationTypeSchema,
} from "@nawasena/schemas";
import { LABEL_STATUS, TEMPLATE } from "../src/modules/notifications/index.js";
import { bacaSchemaPrisma } from "./helpers/prisma-schema.js";

/** Nilai enum `ApplicationStatus` sebagaimana tertulis di schema.prisma. */
function statusDariPrisma(): string[] {
  const isi = /enum\s+ApplicationStatus\s*\{([\s\S]*?)\}/.exec(bacaSchemaPrisma());
  if (isi === null) throw new Error("enum ApplicationStatus tidak ditemukan di schema.prisma");
  return (isi[1] as string)
    .split("\n")
    .map((baris) => baris.replace(/\/\/.*$/, "").trim())
    .filter((baris) => baris.length > 0);
}

describe("applicationStatusSchema sepadan dengan enum Prisma", () => {
  it("nilai yang sama persis, tanpa yang tertinggal di salah satu sisi", () => {
    expect([...applicationStatusSchema.options].sort()).toEqual(statusDariPrisma().sort());
  });

  it("setiap status Prisma punya label manusia di kedua varian bahasa", () => {
    for (const status of statusDariPrisma()) {
      const label = LABEL_STATUS[status as keyof typeof LABEL_STATUS];
      expect(label, `label untuk status "${status}"`).toBeDefined();
      expect(label.id.length).toBeGreaterThan(0);
      expect(label["id-simple"].length).toBeGreaterThan(0);
    }
  });
});

describe("katalog tipe notifikasi", () => {
  it("penamaannya <domain>.<peristiwa>, huruf kecil", () => {
    // Penamaan yang bebas akan membuat tipe baru sulit dicari, dan tipe yang
    // sulit dicari adalah tipe yang diduplikasi dengan nama lain.
    for (const tipe of notificationTypeSchema.options) {
      expect(tipe, `tipe "${tipe}"`).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });

  it("tidak ada template untuk tipe yang tidak terdaftar", () => {
    expect(Object.keys(TEMPLATE).sort()).toEqual([...notificationTypeSchema.options].sort());
  });
});

describe("devicePlatformSchema sepadan dengan enum Prisma (PR-048a)", () => {
  /** Nilai enum `DevicePlatform` sebagaimana tertulis di schema.prisma. */
  function platformDariPrisma(): string[] {
    const isi = /enum\s+DevicePlatform\s*\{([\s\S]*?)\}/.exec(bacaSchemaPrisma());
    if (isi === null) throw new Error("enum DevicePlatform tidak ditemukan di schema.prisma");
    return (isi[1] as string)
      .split("\n")
      .map((baris) => baris.replace(/\/\/.*$/, "").trim())
      .filter((baris) => baris.length > 0);
  }

  it("nilai yang sama persis, tanpa yang tertinggal di salah satu sisi", () => {
    // Menyimpang ke satu arah = klien mengirim platform yang ditolak DB sebagai
    // nilai enum tak dikenal (500, bukan 400). Ke arah sebaliknya = platform
    // yang sah tetapi tidak pernah bisa didaftarkan lewat API.
    expect([...devicePlatformSchema.options].sort()).toEqual(platformDariPrisma().sort());
  });
});
