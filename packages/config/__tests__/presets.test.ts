import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = resolve(__dirname, "..");

function readJson(relativePath: string): Record<string, unknown> {
  const raw = readFileSync(resolve(root, relativePath), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("@incasif/config presets", () => {
  it("mengekspor preset prettier yang valid", () => {
    const prettier = require("../prettier/index.js") as Record<string, unknown>;
    expect(prettier.printWidth).toBe(100);
    expect(prettier.semi).toBe(true);
    expect(prettier.endOfLine).toBe("lf");
  });

  it("mengekspor preset eslint dengan parser typescript", () => {
    const eslint = require("../eslint/base.cjs") as {
      parser: string;
      extends: string[];
      root: boolean;
    };
    expect(eslint.root).toBe(true);
    expect(eslint.parser).toBe("@typescript-eslint/parser");
    expect(eslint.extends).toContain("plugin:@typescript-eslint/recommended");
  });

  it("tsconfig base mengaktifkan strict mode", () => {
    const base = readJson("tsconfig/base.json") as {
      compilerOptions: Record<string, unknown>;
    };
    expect(base.compilerOptions.strict).toBe(true);
    expect(base.compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  it("tsconfig node & react mewarisi base", () => {
    const node = readJson("tsconfig/node.json") as { extends: string };
    const react = readJson("tsconfig/react.json") as { extends: string };
    expect(node.extends).toBe("./base.json");
    expect(react.extends).toBe("./base.json");
  });
});
