import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Aturan label RN (PR-089) diuji dengan me-lint fixture lewat ESLint Node API —
// bukti bahwa gerbangnya benar-benar menolak, bukan hanya tertulis di preset.

// @ts-expect-error — preset CommonJS tanpa deklarasi tipe.
import presetRn from "../eslint/react-native.cjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(dir, "..", "fixtures", "react-native");

async function lint(berkas: string) {
  const eslint = new ESLint({
    cwd: fixtures,
    useEslintrc: false,
    baseConfig: { ...presetRn, settings: { react: { version: "19.2" } } },
    resolvePluginsRelativeTo: path.join(dir, ".."),
  });
  const [hasil] = await eslint.lintFiles([path.join(fixtures, berkas)]);
  return hasil?.messages ?? [];
}

// Pemuatan pertama parser TS + plugin react bisa belasan detik di runner dingin.
describe("preset react-native — label wajib", { timeout: 60_000 }, () => {
  it("menolak elemen interaktif tanpa accessibilityLabel / accessibilityRole", async () => {
    const pesan = await lint("tanpa-label.tsx");
    const terbatas = pesan.filter((m) => m.ruleId === "no-restricted-syntax");

    expect(pesan.filter((m) => m.ruleId !== "no-restricted-syntax")).toEqual([]);
    expect(terbatas).toHaveLength(7);
    expect(terbatas.filter((m) => m.message.includes("accessibilityLabel"))).toHaveLength(4);
    expect(terbatas.filter((m) => m.message.includes("accessibilityRole"))).toHaveLength(3);
  });

  it("menerima elemen berlabel dan elemen non-interaktif", async () => {
    expect(await lint("dengan-label.tsx")).toEqual([]);
  });
});
