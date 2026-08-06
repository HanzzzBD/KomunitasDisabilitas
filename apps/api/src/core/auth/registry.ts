// core/auth — registrar route ber-deklarasi akses (PR-019, SDD §8.2).
//
// MASALAH YANG DIPECAHKAN: broken access control hampir tidak pernah lahir dari
// guard yang salah, melainkan dari guard yang LUPA DIPASANG. Route baru berjalan
// sempurna tanpa penjaga apa pun, test-nya hijau (ia memang mengembalikan data),
// dan tidak ada satu pun sinyal bahwa sesuatu terlewat.
//
// Karena itu deklarasi akses di sini BUKAN dokumentasi, melainkan syarat mount:
// route didaftarkan lewat registrar, dan `assertRoutesDeclared()` menolak boot
// bila menemukan rute yang tidak punya deklarasi. Lupa memasang guard = API
// tidak menyala sama sekali — bukan API yang menyala dalam keadaan terbuka.
//
// Tiga hal yang ditolak saat boot:
//   1. Rute yang terpasang di Express tetapi tidak ada di registry (bypass
//      registrar dengan router.get() langsung).
//   2. Router yang dipasang di luar registry (bypass dengan Router() polos).
//   3. Deklarasi yang tidak pernah terpasang (modul lupa di-mount) — kalau
//      dibiarkan, matriks authz PR-106 akan menguji endpoint hantu.
//
// PREFIX DIPEGANG REGISTRAR, bukan `app.use("/api/v1", router)`. Registrar
// menuliskan path penuh ke Express DAN ke registry, jadi keduanya tidak mungkin
// berbeda. Alternatifnya memaksa validator menebak mount path dari
// `layer.regexp`, dan path yang terdeklarasi bisa diam-diam berbohong terhadap
// path yang sebenarnya dilayani.
import { Router, type Express, type RequestHandler } from "express";
import type { UserRole } from "@nawasena/schemas";

/**
 * Siapa yang boleh memanggil sebuah route. Deny-by-default: tidak ada nilai
 * "belum diputuskan" — setiap route harus memilih salah satu di bawah ini.
 */
export type RouteAccess =
  /** Tanpa sesi. `reason` WAJIB supaya keterbukaan selalu jadi keputusan sadar yang bisa direview. */
  | { kind: "public"; reason: string }
  /** Dijaga token operator (/internal/*), bukan sesi pengguna. */
  | { kind: "internal"; reason: string }
  /** Sesi valid apa pun perannya. */
  | { kind: "authenticated" }
  /** Hanya peran tertentu. */
  | { kind: "role"; roles: readonly UserRole[] }
  /** Hanya pemilik resource: `req.params[param]` harus sama dengan pemilik sesi. */
  | { kind: "self"; param: string; alsoRoles: readonly UserRole[] };

/** Konstruktor deklarasi akses — dipakai di router modul. */
export const access = {
  public: (reason: string): RouteAccess => ({ kind: "public", reason }),
  internal: (reason: string): RouteAccess => ({ kind: "internal", reason }),
  authenticated: (): RouteAccess => ({ kind: "authenticated" }),
  role: (...roles: UserRole[]): RouteAccess => ({ kind: "role", roles }),
  /**
   * `alsoRoles` adalah SATU-SATUNYA jalan memberi peran lain akses ke resource
   * orang lain (mis. admin). Sengaja harus ditulis eksplisit per route: "admin
   * boleh apa saja" yang tersembunyi di dalam guard adalah kebocoran yang tidak
   * pernah terbaca di router.
   */
  self: (param: string, options: { alsoRoles?: UserRole[] } = {}): RouteAccess => ({
    kind: "self",
    param,
    alsoRoles: options.alsoRoles ?? [],
  }),
} as const;

/** Metode HTTP yang didukung registrar. `ALL` = router.all(). */
export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";

/** Satu baris daftar endpoint — bentuk yang dikonsumsi matriks authz (PR-106). */
export interface RouteEntry {
  method: RouteMethod;
  /** Path penuh seperti dilayani Express, mis. `/api/v1/auth/refresh`. */
  path: string;
  access: RouteAccess;
}

/** Gagal boot karena deklarasi akses — bukan error runtime yang bisa ditangani. */
export class RouteAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteAccessError";
  }
}

/** Menerjemahkan deklarasi menjadi middleware; implementasinya di rbac.ts. */
export type GuardsFor = (access: RouteAccess) => RequestHandler[];

/** Registrar milik satu modul; `router` dipasang apa adanya di root app. */
export interface RouteRegistrar {
  readonly router: Router;
  get(path: string, access: RouteAccess, ...handlers: RequestHandler[]): RouteRegistrar;
  post(path: string, access: RouteAccess, ...handlers: RequestHandler[]): RouteRegistrar;
  put(path: string, access: RouteAccess, ...handlers: RequestHandler[]): RouteRegistrar;
  patch(path: string, access: RouteAccess, ...handlers: RequestHandler[]): RouteRegistrar;
  delete(path: string, access: RouteAccess, ...handlers: RequestHandler[]): RouteRegistrar;
  all(path: string | string[], access: RouteAccess, ...handlers: RequestHandler[]): RouteRegistrar;
}

/** Bentuk internal Express 4 yang dibaca validator (tidak ada di @types). */
interface ExpressLayer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle?: unknown;
  regexp?: { fast_slash?: boolean };
}
interface WithStack {
  stack?: ExpressLayer[];
}

/** Router Express adalah fungsi yang sekaligus punya stack + use + route. */
function isRouter(handle: unknown): handle is Router & WithStack {
  if (typeof handle !== "function") return false;
  const kandidat = handle as Partial<Router> & WithStack;
  return (
    Array.isArray(kandidat.stack) &&
    typeof kandidat.use === "function" &&
    typeof kandidat.route === "function"
  );
}

/** Gabungkan prefix modul dengan path route; keduanya dinormalkan ke satu `/`. */
function gabung(basePath: string, path: string): string {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const sisa = path.startsWith("/") ? path : `/${path}`;
  return `${base}${sisa}`;
}

export function createRouteRegistry(deps: { guardsFor: GuardsFor }) {
  const entries: RouteEntry[] = [];
  /** Router yang lahir dari registry ini — apa pun di luar daftar ini ditolak. */
  const dikenal = new Set<Router>();

  return {
    /**
     * Registrar untuk satu modul. `basePath` mis. `/api/v1` (kosong untuk
     * endpoint root seperti /healthz). Router hasilnya dipasang TANPA prefix:
     * `app.use(registrar.router)`.
     */
    forModule(basePath: string): RouteRegistrar {
      const router = Router();
      dikenal.add(router);

      function daftar(
        method: RouteMethod,
        path: string | string[],
        akses: RouteAccess,
        handlers: RequestHandler[],
      ): RouteRegistrar {
        const penuh = (Array.isArray(path) ? path : [path]).map((p) => gabung(basePath, p));

        for (const p of penuh) {
          const kembar = entries.find((e) => e.method === method && e.path === p);
          if (kembar !== undefined) {
            // Dua deklarasi untuk satu rute berarti hanya yang pertama pernah
            // dijalankan Express — yang kedua adalah aturan akses yang diam.
            throw new RouteAccessError(`Rute terdaftar dua kali: ${method} ${p}`);
          }
          entries.push({ method, path: p, access: akses });
        }

        // Guard SELALU di depan handler modul — tidak ada jalan memasangnya
        // setengah jalan atau melewatkannya untuk satu handler saja.
        const guards = deps.guardsFor(akses);
        const pasang =
          method === "ALL"
            ? router.all.bind(router)
            : router[method.toLowerCase() as "get"].bind(router);
        for (const p of penuh) pasang(p, ...guards, ...handlers);

        return registrar;
      }

      const registrar: RouteRegistrar = {
        router,
        get: (path, akses, ...h) => daftar("GET", path, akses, h),
        post: (path, akses, ...h) => daftar("POST", path, akses, h),
        put: (path, akses, ...h) => daftar("PUT", path, akses, h),
        patch: (path, akses, ...h) => daftar("PATCH", path, akses, h),
        delete: (path, akses, ...h) => daftar("DELETE", path, akses, h),
        all: (path, akses, ...h) => daftar("ALL", path, akses, h),
      };
      return registrar;
    },

    /**
     * Daftar endpoint + aksesnya, terurut stabil. Inilah yang dibaca matriks
     * authz autogenerated (PR-106) dan test yang ingin memastikan tidak ada
     * endpoint yang diam-diam berubah menjadi publik.
     */
    list(): RouteEntry[] {
      return [...entries].sort((a, b) =>
        a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
      );
    },

    /** Router ini lahir dari registry? Dipakai validator. */
    knows(router: unknown): boolean {
      return dikenal.has(router as Router);
    },
  };
}

export type RouteRegistry = ReturnType<typeof createRouteRegistry>;

/**
 * Gerbang boot: pastikan SETIAP rute yang dilayani app punya deklarasi akses,
 * dan setiap deklarasi benar-benar terpasang. Melempar `RouteAccessError` →
 * proses gagal start. Dipanggil setelah seluruh router di-mount.
 */
export function assertRoutesDeclared(app: Express, registry: RouteRegistry): void {
  const dideklarasikan = new Set(registry.list().map((e) => `${e.method} ${e.path}`));
  const ditemukan = new Set<string>();
  const pelanggaran: string[] = [];

  function telusuri(layers: ExpressLayer[]): void {
    for (const layer of layers) {
      if (layer.route !== undefined) {
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        for (const path of paths) {
          for (const kunci of metodeOf(layer.route.methods)) {
            const tanda = `${kunci} ${path}`;
            ditemukan.add(tanda);
            if (!dideklarasikan.has(tanda)) {
              pelanggaran.push(`${tanda} — terpasang tanpa deklarasi akses (pakai registrar route)`);
            }
          }
        }
        continue;
      }

      if (isRouter(layer.handle)) {
        if (!registry.knows(layer.handle)) {
          pelanggaran.push("Router dipasang di luar route registry (createRouteRegistry().forModule)");
          continue;
        }
        // Registrar sudah menulis path penuh; memasangnya dengan prefix membuat
        // URL sebenarnya berbeda dari yang terdeklarasi.
        if (layer.regexp?.fast_slash !== true) {
          pelanggaran.push("Router registry dipasang dengan prefix — gunakan app.use(registrar.router)");
          continue;
        }
        telusuri(layer.handle.stack ?? []);
      }
      // Sisanya middleware biasa (helmet, cors, json, logger) — tidak punya rute.
    }
  }

  telusuri((app as unknown as { _router?: WithStack })._router?.stack ?? []);

  for (const tanda of dideklarasikan) {
    if (!ditemukan.has(tanda)) {
      pelanggaran.push(`${tanda} — dideklarasikan tetapi routernya tidak terpasang`);
    }
  }

  if (pelanggaran.length > 0) {
    throw new RouteAccessError(
      `Deklarasi akses route tidak lengkap:\n  - ${pelanggaran.join("\n  - ")}`,
    );
  }
}

/** `{ get: true }` → ["GET"]; `{ _all: true }` → ["ALL"]. */
function metodeOf(methods: Record<string, boolean>): RouteMethod[] {
  return Object.keys(methods)
    .filter((m) => methods[m] === true)
    .map((m) => (m === "_all" ? "ALL" : (m.toUpperCase() as RouteMethod)));
}
