import { describe, it, expect } from "vitest";
import { ESLint, type Linter } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Uji preset boundaries dengan me-lint fixtures secara programatik lewat ESLint
// Node API. Ini membuktikan gate benar-benar bekerja: file yang melanggar
// menghasilkan error dengan rule ID yang tepat, file valid nol error.

// @ts-expect-error — preset CommonJS tanpa deklarasi tipe.
import boundariesPreset from "../eslint/boundaries.cjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
// Fixtures sengaja DILUAR __tests__/ agar tidak kena "boundaries/ignore"
// (yang mengabaikan **/__tests__/**), sehingga elemen tetap terklasifikasi.
const fixtures = path.join(dir, "..", "fixtures");

function makeESLint(): ESLint {
  return new ESLint({
    cwd: fixtures,
    useEslintrc: false,
    // Nonaktifkan type-aware parsing (fixtures tidak di-include tsconfig).
    baseConfig: {
      ...boundariesPreset,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    // Plugin di-resolve dari node_modules packages/config.
    resolvePluginsRelativeTo: path.join(dir, ".."),
  });
}

async function lintFile(relPath: string) {
  const eslint = makeESLint();
  const abs = path.join(fixtures, relPath);
  const results = await eslint.lintFiles([abs]);
  const messages = results[0]?.messages ?? [];
  return {
    ruleIds: messages.map((m: Linter.LintMessage) => m.ruleId),
    messages,
  };
}

describe("preset boundaries (@nawasena/config/eslint/boundaries)", () => {
  it("menolak impor repository lintas modul (element-types)", async () => {
    const { ruleIds } = await lintFile(
      "violations/cross-module-repo/src/modules/jobs/services/jobs.service.ts",
    );
    expect(ruleIds).toContain("boundaries/element-types");
  });

  it("menolak impor SDK AI di luar core/ai (external)", async () => {
    const { ruleIds } = await lintFile(
      "violations/ai-sdk-outside-core/src/modules/matching/services/matching.service.ts",
    );
    expect(ruleIds).toContain("boundaries/external");
  });

  it("menolak router yang loncat lapisan ke repository (element-types)", async () => {
    const { ruleIds } = await lintFile(
      "violations/layer-jump/src/modules/jobs/routers/jobs.router.ts",
    );
    expect(ruleIds).toContain("boundaries/element-types");
  });

  it("mengizinkan aliran lapisan yang benar + service antar-modul (nol error boundaries)", async () => {
    const files = [
      "src/modules/jobs/routers/jobs.router.ts",
      "src/modules/jobs/controllers/jobs.controller.ts",
      "src/modules/jobs/services/jobs.service.ts",
      "src/modules/jobs/repositories/jobs.repository.ts",
      "src/core/ai/gateway.ts",
    ];
    for (const f of files) {
      const { messages } = await lintFile(f);
      const boundaryErrors = messages.filter((m: Linter.LintMessage) =>
        m.ruleId?.startsWith("boundaries/"),
      );
      expect(
        boundaryErrors,
        `${f} seharusnya bebas pelanggaran boundaries, tapi: ${JSON.stringify(boundaryErrors)}`,
      ).toHaveLength(0);
    }
  });
});
