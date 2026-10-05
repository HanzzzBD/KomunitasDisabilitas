// Penjaga resolver Metro (2026-10-05): APK EAS pertama tertutup saat dibuka
// karena bundle memuat DUA zod — `zod-openapi/extend` (CJS) memasang
// `.openapi()` ke `lib/index.js`, sedangkan @nawasena/schemas memakai
// `lib/index.mjs`. Test ini memastikan setiap `import "zod"` berakhir di SATU
// berkas, dari asal mana pun. Vitest/Node tidak pernah melihat bug aslinya —
// karena itu penjaganya harus di konfigurasi resolver, bukan di test skema.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

interface HasilResolve {
  type: string;
  filePath?: string;
}

const config = require("../metro.config.js") as {
  resolver: {
    resolveRequest: (konteks: unknown, nama: string, platform: string) => HasilResolve;
  };
};

const konteksPalsu = (asal: string) => ({
  originModulePath: asal,
  // Bila resolver kustom jatuh ke resolver bawaan untuk "zod", test gagal keras.
  resolveRequest: () => {
    throw new Error("zod tidak boleh diserahkan ke resolver bawaan");
  },
});

describe("metro.config — satu instance zod", () => {
  const asal = [
    resolve(__dirname, "../../../packages/schemas/src/common.ts"),
    resolve(__dirname, "../src/App.tsx"),
    "/x/node_modules/.pnpm/zod-openapi@4.2.4_zod@3.24.1/node_modules/zod-openapi/dist/extend.cjs",
    "/x/node_modules/.pnpm/zod-openapi@4.2.4_zod@3.24.1/node_modules/zod-openapi/dist/extend.mjs",
  ];

  it("setiap asal mendapat berkas zod yang SAMA, dan itu entri CJS", () => {
    const berkas = asal.map(
      (a) => config.resolver.resolveRequest(konteksPalsu(a), "zod", "android").filePath,
    );
    expect(new Set(berkas).size).toBe(1);
    expect(berkas[0]).toMatch(/zod[\\/]lib[\\/]index\.js$/);
  });

  it("impor lain tidak ikut dibelokkan", () => {
    const dipanggil: string[] = [];
    const konteks = {
      originModulePath: asal[0],
      resolveRequest: (_k: unknown, nama: string) => {
        dipanggil.push(nama);
        return { type: "sourceFile", filePath: "/x" };
      },
    };
    config.resolver.resolveRequest(konteks, "zod-openapi/extend", "android");
    expect(dipanggil).toEqual(["zod-openapi/extend"]);
  });
});
