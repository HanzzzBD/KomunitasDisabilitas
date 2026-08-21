// Preset ESLint "boundaries" — menegakkan arsitektur monolith modular (ADR-001,
// ADR-012, SDD §5.1) sebagai kode, bukan disiplin manual.
//
// Dikonsumsi via: module.exports = require("@nawasena/config/eslint/boundaries")
// Dipakai HANYA oleh apps/api (satu-satunya artefak dengan modul & lapisan).
// App/paket lain cukup pakai preset dasar "@nawasena/config/eslint".
//
// Aturan yang ditegakkan:
//   1. Lapisan satu arah: router → controller → service → repository.
//      Dilarang loncat lapisan (router tidak boleh langsung ke service/repo).
//   2. Dilarang impor repository lintas modul (modul A ⇏ repo modul B).
//      Antar-modul HANYA lewat service layer.
//   3. Dilarang impor SDK AI langsung di luar core/ai (bypass AI Gateway).
//
// Model elemen (boundaries/elements): setiap file diklasifikasikan berdasarkan
// path-nya. `capture: ["module"]` merekam nama modul agar aturan bisa membedakan
// "modul yang sama" vs "modul berbeda" lewat placeholder ${from.module}.

const base = require("./base.cjs");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...base,
  plugins: [...(base.plugins || []), "boundaries"],
  extends: [...(base.extends || []), "plugin:boundaries/recommended"],
  settings: {
    ...(base.settings || {}),
    "boundaries/dependency-nodes": ["import", "require"],
    // RESOLVER. Urutannya berarti, dan salah satunya menentukan apakah gerbang
    // ini menjaga sesuatu sama sekali.
    //
    // `resolver-ts.cjs` memetakan penentu ESM/NodeNext (`./x.js`) ke berkas
    // yang sungguhan ada (`x.ts`). Tanpa itu, SETIAP impor relatif di
    // `apps/api` gagal di-resolve — dan dependensi yang gagal di-resolve
    // DILEWATI DIAM-DIAM oleh plugin ini, bukan dilaporkan. Penjelasan lengkap
    // beserta cara membuktikannya ada di berkas itu.
    //
    // `node` TETAP terpasang sesudahnya, dan itu disengaja: ia yang melayani
    // penentu telanjang (`express`, `@nawasena/schemas`). Membiarkannya
    // menjaga klasifikasi "eksternal" persis seperti sebelumnya — yang
    // diperbaiki PR ini hanya impor relatif yang selama ini tak terlihat.
    "import/resolver": {
      [require.resolve("./resolver-ts.cjs")]: {},
      node: { extensions: [".ts", ".tsx", ".js", ".jsx", ".json"] },
    },
    "boundaries/elements": [
      // core/ai — satu-satunya tempat SDK AI boleh diimpor (AI Gateway).
      { type: "core-ai", pattern: "src/core/ai", mode: "folder" },
      // core lain (http, auth, config bersama).
      { type: "core", pattern: "src/core/*", mode: "folder" },
      // Lapisan di dalam modul. `module` = nama modul (auth, jobs, dst).
      {
        type: "router",
        pattern: "src/modules/*/routers",
        mode: "folder",
        capture: ["module"],
      },
      {
        type: "controller",
        pattern: "src/modules/*/controllers",
        mode: "folder",
        capture: ["module"],
      },
      {
        type: "service",
        pattern: "src/modules/*/services",
        mode: "folder",
        capture: ["module"],
      },
      {
        type: "repository",
        pattern: "src/modules/*/repositories",
        mode: "folder",
        capture: ["module"],
      },
      // File modul lain (types.ts, index.ts) — dianggap "shared modul".
      {
        type: "module-shared",
        pattern: "src/modules/*",
        mode: "folder",
        capture: ["module"],
      },
    ],
    "boundaries/ignore": ["**/*.test.ts", "**/__tests__/**"],
  },
  rules: {
    ...base.rules,

    // ---- Aturan 1 & 2: aliran antar-elemen ----
    "boundaries/element-types": [
      "error",
      {
        default: "disallow",
        rules: [
          // core/ai & core boleh dipakai siapa saja; core-ai hanya impor eksternal.
          { from: "core-ai", allow: ["core", "core-ai"] },
          { from: "core", allow: ["core", "core-ai"] },

          // Router: hanya boleh ke controller-nya sendiri (+ core).
          {
            from: "router",
            allow: [
              "core",
              ["controller", { module: "${from.module}" }],
              ["module-shared", { module: "${from.module}" }],
            ],
          },
          // Controller: ke service-nya sendiri (+ core). TIDAK ke repository.
          {
            from: "controller",
            allow: [
              "core",
              "core-ai",
              ["service", { module: "${from.module}" }],
              ["module-shared", { module: "${from.module}" }],
            ],
          },
          // Service: ke repository-nya sendiri, DAN service modul lain
          // (komunikasi antar-modul via service). TIDAK ke repo modul lain.
          {
            from: "service",
            allow: [
              "core",
              "core-ai",
              "service",
              ["repository", { module: "${from.module}" }],
              ["module-shared", { module: "${from.module}" }],
            ],
          },
          // Repository: paling bawah — hanya core (Prisma via core), tidak ke atas.
          {
            from: "repository",
            allow: ["core", ["repository", { module: "${from.module}" }], "module-shared"],
          },
          // File shared modul (`index.ts`, `types.ts`) — AKAR PERAKITAN modul.
          //
          // Ia boleh menyentuh SELURUH lapisan modulnya SENDIRI, dan itu bukan
          // kelonggaran melainkan pengakuan atas apa yang berkas ini memang
          // ada untuk melakukannya. Template modul di CLAUDE.md §5.3
          // mendaftarkan `index.ts` sebagai berkas yang merakit router,
          // controller, service, dan repository menjadi satu modul siap pasang
          // (DI manual via factory, ADR-002). Tanpa izin ini, pola yang
          // didokumentasikan sendiri oleh repo ini mustahil ditulis — dan
          // keenam modul yang ada hari ini semuanya melanggarnya.
          //
          // DIBATASI KE MODUL YANG SAMA (`${from.module}`). Inilah yang menjaga
          // aturan sesungguhnya tetap utuh: `index.ts` modul A tetap TIDAK bisa
          // menyentuh apa pun milik modul B.
          //
          // Yang SENGAJA TIDAK ditambahkan: izin bagi elemen lain menyentuh
          // `module-shared` modul LAIN. `index.ts` tiap modul mengekspor ulang
          // repository-nya (lihat `modules/users/index.ts`), jadi mengizinkan
          // "modul A boleh impor index modul B" akan membuat repository modul B
          // terjangkau lewat pintu belakang — persis lubang yang aturan nomor 2
          // di atas ada untuk menutupnya. Antar-modul tetap HANYA lewat service.
          {
            from: "module-shared",
            allow: [
              "core",
              "core-ai",
              ["module-shared", { module: "${from.module}" }],
              ["router", { module: "${from.module}" }],
              ["controller", { module: "${from.module}" }],
              ["service", { module: "${from.module}" }],
              ["repository", { module: "${from.module}" }],
            ],
          },
        ],
      },
    ],

    // ---- Aturan 3: SDK AI hanya di core/ai ----
    "boundaries/external": [
      "error",
      {
        default: "allow",
        rules: [
          {
            from: ["core-ai"],
            allow: ["@google/generative-ai", "groq-sdk", "openai"],
          },
          {
            // Semua elemen SELAIN core-ai dilarang impor SDK AI langsung.
            from: ["core", "router", "controller", "service", "repository", "module-shared"],
            disallow: ["@google/generative-ai", "groq-sdk", "openai"],
            message: "Impor SDK AI hanya diizinkan di core/ai (AI Gateway, ADR-012).",
          },
        ],
      },
    ],

    // Matikan aturan yang terlalu berisik untuk MVP (entry-point/no-private).
    "boundaries/entry-point": "off",
    "boundaries/no-private": "off",
    "boundaries/no-unknown": "off",
    "boundaries/no-unknown-files": "off",
  },
};
