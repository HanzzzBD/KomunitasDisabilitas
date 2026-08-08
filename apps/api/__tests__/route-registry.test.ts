// Route registry + gerbang boot (PR-019).
//
// AC yang dijaga file ini: "Route tanpa deklarasi akses → boot error" dan
// "Registry meng-ekspor daftar endpoint+akses (dipakai PR-106)".
import { describe, it, expect } from "vitest";
import express, { Router } from "express";
import {
  access,
  assertRoutesDeclared,
  createRouteRegistry,
  RouteAccessError,
  type RouteRegistry,
} from "../src/core/auth/index.js";

const kosong = (): void => {};
const guardPalsu = (_req: unknown, _res: unknown, next: () => void) => next();

function registry(): RouteRegistry {
  return createRouteRegistry({
    guardsFor: (akses) => (akses.kind === "public" ? [] : [guardPalsu]),
  });
}

describe("registrar route", () => {
  it("prefix modul ikut tercatat, jadi path deklarasi == path yang dilayani", () => {
    const reg = registry();
    reg.forModule("/api/v1").get("/me", access.authenticated(), kosong);
    reg.forModule("").get("/healthz", access.public("probe"), kosong);

    expect(reg.list().map((e) => `${e.method} ${e.path}`)).toEqual([
      "GET /api/v1/me",
      "GET /healthz",
    ]);
  });

  it("daftar endpoint membawa deklarasi aksesnya (konsumen: matriks PR-106)", () => {
    const reg = registry();
    reg
      .forModule("/api/v1")
      .get("/pengguna/:userId", access.self("userId", { alsoRoles: ["admin"] }), kosong)
      .get("/admin/statistik", access.role("admin"), kosong);

    expect(reg.list()).toEqual([
      {
        method: "GET",
        path: "/api/v1/admin/statistik",
        access: { kind: "role", roles: ["admin"] },
      },
      {
        method: "GET",
        path: "/api/v1/pengguna/:userId",
        access: { kind: "self", param: "userId", alsoRoles: ["admin"] },
      },
    ]);
  });

  it("rute yang sama didaftarkan dua kali → error (aturan kedua tidak akan pernah jalan)", () => {
    const reg = registry();
    const routes = reg.forModule("/api/v1");
    routes.post("/masuk", access.public("login"), kosong);
    expect(() => routes.post("/masuk", access.authenticated(), kosong)).toThrow(RouteAccessError);
  });

  it("router.all dengan banyak path mencatat semuanya", () => {
    const reg = registry();
    reg.forModule("/api/v1").all(["/a", "/b"], access.public("tertutup"), kosong);
    expect(reg.list().map((e) => `${e.method} ${e.path}`)).toEqual([
      "ALL /api/v1/a",
      "ALL /api/v1/b",
    ]);
  });
});

describe("assertRoutesDeclared — gerbang boot", () => {
  it("seluruh rute lahir dari registrar → lolos", () => {
    const reg = registry();
    const routes = reg.forModule("/api/v1");
    routes.get("/me", access.authenticated(), kosong);
    const app = express();
    app.use(express.json()); // middleware biasa tidak boleh dianggap rute
    app.use(routes.router);

    expect(() => assertRoutesDeclared(app, reg)).not.toThrow();
  });

  it("rute dipasang langsung ke router registry (bypass registrar) → boot GAGAL", () => {
    const reg = registry();
    const routes = reg.forModule("/api/v1");
    routes.get("/me", access.authenticated(), kosong);
    // Persis kelalaian yang hendak dicegah: guard-nya tidak lupa dipasang,
    // deklarasinya yang tidak pernah ditulis.
    routes.router.get("/api/v1/rahasia", kosong);
    const app = express();
    app.use(routes.router);

    expect(() => assertRoutesDeclared(app, reg)).toThrow(RouteAccessError);
    expect(() => assertRoutesDeclared(app, reg)).toThrow(/GET \/api\/v1\/rahasia/);
  });

  it("rute dipasang langsung ke app → boot GAGAL", () => {
    const reg = registry();
    const app = express();
    app.get("/lolos-begitu-saja", kosong);

    expect(() => assertRoutesDeclared(app, reg)).toThrow(/tanpa deklarasi akses/);
  });

  it("Router polos di luar registry → boot GAGAL", () => {
    const reg = registry();
    const liar = Router();
    liar.get("/bayangan", kosong);
    const app = express();
    app.use(liar);

    expect(() => assertRoutesDeclared(app, reg)).toThrow(/di luar route registry/);
  });

  it("router registry dipasang dengan prefix → boot GAGAL (path deklarasi jadi bohong)", () => {
    const reg = registry();
    const routes = reg.forModule("/api/v1");
    routes.get("/me", access.authenticated(), kosong);
    const app = express();
    app.use("/tambahan", routes.router);

    expect(() => assertRoutesDeclared(app, reg)).toThrow(/prefix/);
  });

  it("deklarasi yang routernya tidak dipasang → boot GAGAL (endpoint hantu di matriks)", () => {
    const reg = registry();
    reg.forModule("/api/v1").get("/me", access.authenticated(), kosong);
    const app = express();

    expect(() => assertRoutesDeclared(app, reg)).toThrow(/tidak terpasang/);
  });

  it("beberapa modul di satu app diperiksa seluruhnya", () => {
    const reg = registry();
    const satu = reg.forModule("");
    satu.get("/healthz", access.public("probe"), kosong);
    const dua = reg.forModule("/api/v1");
    dua.get("/me", access.authenticated(), kosong);
    dua.router.delete("/api/v1/semua", kosong); // diselundupkan di modul kedua

    const app = express();
    app.use(satu.router);
    app.use(dua.router);

    expect(() => assertRoutesDeclared(app, reg)).toThrow(/DELETE \/api\/v1\/semua/);
  });
});
