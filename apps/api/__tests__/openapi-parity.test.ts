// Penjaga kesepadanan ROUTE ↔ DOKUMEN OpenAPI.
//
// ALASAN BERKAS INI ADA. Antara PR-034 dan PR-043a, EMPAT PR berturut-turut
// menambah endpoint tanpa mendaftarkannya di `packages/schemas/src/openapi.ts`:
// `/me/accessibility`, `/me/profile`, dua belas route karier, lalu `/ai/quota`.
// Tidak satu pun tertangkap, sebab tidak ada yang memeriksanya — utangnya hanya
// dicatat di prosa log, dan prosa tidak menjatuhkan build. Log PR-038 bahkan
// menjadwalkan pembayarannya "di PR-040"; PR-040 justru mewarisi dan menambahnya.
//
// Yang dijaga di sini karena itu bukan "dokumen rapi", melainkan: klien mobile
// (Phase 15) meng-generate diri dari `openapi.json`, jadi endpoint yang tak
// terdokumentasi adalah endpoint yang tidak ada bagi mereka.
//
// Sengaja membaca `openapi.json` YANG DI-COMMIT, bukan memanggil ulang
// `buildOpenApiDocument()`: berkas itulah artefak yang benar-benar dipakai
// konsumen. Kesepadanannya dengan zod sudah dijaga terpisah oleh
// `pnpm --filter @nawasena/schemas check:openapi` di CI.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import { createRouteRegistry, createAccessGuards } from "../src/core/auth/index.js";
import { createLogger } from "../src/core/logger/index.js";
import { parseFieldKeys } from "../src/core/crypto/index.js";
import { createAuthModule } from "../src/modules/auth/index.js";
import { createUsersModule } from "../src/modules/users/index.js";
import { createAccessibilityModule } from "../src/modules/accessibility/index.js";
import { createAiModule } from "../src/modules/ai/index.js";
import { createProfilesModule } from "../src/modules/profiles/index.js";
import { createHealthModule } from "../src/modules/health/index.js";
import { createInternalModule } from "../src/modules/internal/index.js";
import { busUji } from "./helpers/events.js";
import { SESSION_KEYS } from "./helpers/session.js";

const PREFIX = "/api/v1";

/** Semua factory modul di bawah MURNI konstruksi — tidak satu pun menyentuh I/O. */
const stub = <T,>(): T => ({}) as T;

const logger = createLogger(
  { LOG_LEVEL: "fatal" },
  { destination: new Writable({ write: (_c, _e, cb) => cb() }) },
);

/**
 * Rakit registry dari router NYATA — bukan daftar path yang ditulis tangan.
 *
 * Ini titik pentingnya: route karier dideklarasikan lewat `daftarkanKarier()`
 * dengan path yang dirakit dari variabel (`${basis}/:id`). Daftar tangan atau
 * pemindaian statis akan melewatkannya — dan justru dua belas route itulah
 * yang paling lama tak terdokumentasi.
 */
function routeNyata(): { method: string; path: string }[] {
  const guards = createAccessGuards({
    findSessionUser: () => Promise.resolve(null),
    // `access.internal` menuntut guard-nya ADA saat route didaftarkan (bukan
    // saat dipanggil) — tanpa ini `/internal/queues` melempar di perakitan.
    internalGuard: (_req, _res, next) => {
      next();
    },
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  const events = busUji();
  const auditLog = { catat: () => Promise.resolve() };

  // SEMUA rahasia diisi dengan sengaja. `createAuthRouter` mendaftarkan route
  // yang BERBEDA saat rahasianya kosong: tanpa kunci RS256 ia memasang
  // `ALL /auth/otp/*` dan `ALL /auth/refresh` (varian 503 tertutup) alih-alih
  // keenam POST yang sesungguhnya. Merakitnya setengah terkonfigurasi berarti
  // membandingkan dokumen dengan permukaan yang tidak pernah dilayani
  // produksi — penjaga yang mengukur benda yang salah. Dijaga test pertama.
  createAuthModule({
    prisma: stub(),
    redis: stub(),
    otpHashSecret: "rahasia-otp-untuk-test",
    sessionKeys: SESSION_KEYS,
    google: {
      clientId: "uji",
      clientSecret: "uji",
      jwksUrl: "https://example.invalid/jwks",
      tokenUrl: "https://example.invalid/token",
      timeoutMs: 1000,
    },
    routes: registry.forModule(PREFIX),
    auditLog: stub(),
    events,
    logger,
  });
  createUsersModule({
    prisma: stub(),
    redis: stub(),
    routes: registry.forModule(PREFIX),
    auditLog: stub(),
  });
  createAccessibilityModule({
    prisma: stub(),
    routes: registry.forModule(PREFIX),
    auditLog: stub(),
    events,
  });
  createAiModule({ quota: stub(), routes: registry.forModule(PREFIX) });
  createProfilesModule({
    prisma: stub(),
    routes: registry.forModule(PREFIX),
    fieldKeys: parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 7).toString("base64") }),
    auditLog: auditLog as never,
    events,
  });

  // Permukaan operasional — ikut dirakit supaya test terakhir benar-benar
  // memeriksa isinya, bukan memeriksa daftar kosong.
  createHealthModule(stub(), stub(), registry.forModule(""));
  createInternalModule({
    registry: stub(),
    dlqQueueOf: () => stub(),
    routes: registry.forModule(""),
  });

  return registry.list().map((e) => ({ method: e.method, path: e.path }));
}

/** `/api/v1/me/skills/:id` → `/me/skills/{id}`, bentuk yang dipakai OpenAPI. */
function keBentukOpenApi(path: string): string {
  return path.slice(PREFIX.length).replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function operasiTerdokumentasi(): Set<string> {
  const berkas = fileURLToPath(new URL("../../../packages/schemas/openapi.json", import.meta.url));
  const dokumen = JSON.parse(readFileSync(berkas, "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
  };
  const hasil = new Set<string>();
  for (const [path, item] of Object.entries(dokumen.paths)) {
    for (const metode of Object.keys(item)) {
      if (["get", "post", "put", "patch", "delete"].includes(metode)) {
        hasil.add(`${metode.toUpperCase()} ${path}`);
      }
    }
  }
  return hasil;
}

describe("kesepadanan route ↔ openapi.json", () => {
  const semua = routeNyata();
  const klien = semua
    .filter((r) => r.path.startsWith(`${PREFIX}/`))
    .map((r) => `${r.method} ${keBentukOpenApi(r.path)}`)
    .sort();

  it("router nyata memang terbaca — termasuk route karier yang dirakit dari variabel", () => {
    // Penjaga atas penjaga: bila perakitan modul di atas diam-diam gagal
    // menghasilkan route (mis. factory berubah), tiga test di bawah menjadi
    // hampa — nol lawan nol selalu sepadan.
    expect(klien.length).toBeGreaterThanOrEqual(15);
    expect(klien).toContain("PUT /me/experiences/{id}");
    expect(klien).toContain("DELETE /me/skills/{id}");

    // Auth dirakit TERKONFIGURASI PENUH — bukan varian 503 tertutup. Tanpa
    // baris ini, rahasia yang lupa diisi membuat kedua test kesepadanan di
    // bawah membandingkan `ALL /auth/otp/*` dan tetap bisa dibuat hijau
    // dengan mengubah dokumen ke bentuk yang salah.
    expect(klien).toContain("POST /auth/otp/request");
    expect(klien).toContain("POST /auth/refresh");
    expect(klien.filter((op) => op.startsWith("ALL "))).toEqual([]);
  });

  it("SETIAP endpoint /api/v1 terdokumentasi di openapi.json", () => {
    const terdokumentasi = operasiTerdokumentasi();
    const belum = klien.filter((op) => !terdokumentasi.has(op));

    // Pesannya menyebut nama operasinya, bukan sekadar "panjangnya beda":
    // orang yang membuat ini merah sedang menambah endpoint, dan yang ia
    // butuhkan adalah daftar apa yang harus ia tulis.
    expect(belum, `Endpoint hidup tetapi tidak ada di openapi.json:\n${belum.join("\n")}`).toEqual(
      [],
    );
  });

  it("openapi.json tidak menjanjikan endpoint yang tidak ada", () => {
    const hidup = new Set(klien);
    const hantu = [...operasiTerdokumentasi()].filter((op) => !hidup.has(op)).sort();

    expect(hantu, `Terdokumentasi tetapi tidak dilayani:\n${hantu.join("\n")}`).toEqual([]);
  });

  it("route di luar /api/v1 memang SENGAJA tidak didokumentasikan", () => {
    // `/healthz`, `/readyz`, `/internal/*` adalah permukaan operasional, bukan
    // kontrak klien — dokumen publik yang memuatnya mengundang orang memakainya.
    // Ditulis sebagai assertion, bukan sebagai filter diam, supaya penambahan
    // route non-versioned baru harus lewat sini dulu.
    const luar = semua
      .filter((r) => !r.path.startsWith(`${PREFIX}/`))
      .map((r) => r.path)
      .sort();

    expect([...new Set(luar)]).toEqual(["/healthz", "/internal/queues", "/readyz"]);
  });
});
