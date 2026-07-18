import { describe, it, expect } from "vitest";
import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// AC "tree-shakeable (bundle test)": impor queryKey saja TIDAK ikut menyeret
// client fetch / endpoint / zod ke bundle. sideEffects:false + ESM = prasyarat.
async function bundleSnippet(snippet: string): Promise<string> {
  const result = await build({
    stdin: {
      contents: snippet,
      resolveDir: pkgDir,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    treeShaking: true,
    minify: false,
    platform: "neutral",
    mainFields: ["module", "main"],
  });
  return result.outputFiles[0]?.text ?? "";
}

describe("tree-shaking (esbuild bundle test)", () => {
  it("impor queryKey saja → bundle tanpa client/fetch/endpoint/zod", async () => {
    const out = await bundleSnippet(
      `import { queryKey } from "./src/index.js"; console.log(queryKey("jobs"));`,
    );
    expect(out).toContain("queryKey");
    expect(out).not.toContain("createApiClient");
    expect(out).not.toContain("requestOtp");
    expect(out).not.toContain("ZodError"); // zod tidak terseret
  });

  it("impor penuh → bundle memuat client (sanity: test di atas bukan false positive)", async () => {
    const out = await bundleSnippet(
      `import { createApiClient } from "./src/index.js"; console.log(createApiClient);`,
    );
    expect(out).toContain("createApiClient");
  });
});

describe("bebas dependensi DOM (jalan di React Native)", () => {
  it("tidak ada referensi API DOM di seluruh source bundle", async () => {
    const out = await bundleSnippet(`export * from "./src/index.js";`);
    for (const domGlobal of [
      "document.",
      "window.",
      "localStorage",
      "sessionStorage",
      "XMLHttpRequest",
    ]) {
      expect(out, `bundle memuat API DOM: ${domGlobal}`).not.toContain(domGlobal);
    }
  });
});
