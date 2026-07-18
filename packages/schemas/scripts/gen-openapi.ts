/* eslint-disable no-console -- script CLI: output ke console adalah antarmukanya */
// Generator openapi.json dari skema zod (PR-004).
//
//   pnpm --filter @incasif/schemas gen:openapi     → tulis openapi.json
//   pnpm --filter @incasif/schemas check:openapi   → diff; drift = exit 1 (CI merah)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderOpenApiJson } from "../src/openapi.js";

const outFile = resolve(dirname(fileURLToPath(import.meta.url)), "..", "openapi.json");
const expected = renderOpenApiJson();
const checkMode = process.argv.includes("--check");

if (checkMode) {
  const actual = existsSync(outFile) ? readFileSync(outFile, "utf8") : null;
  if (actual === expected) {
    console.log("openapi.json sinkron dengan skema zod.");
    process.exit(0);
  }
  console.error(
    [
      "DRIFT KONTRAK: openapi.json tidak sinkron dengan skema zod.",
      actual === null ? "(openapi.json belum ada)" : "(isi berbeda dengan hasil generate)",
      "Perbaiki dengan: pnpm --filter @incasif/schemas gen:openapi, lalu commit hasilnya.",
    ].join("\n"),
  );
  process.exit(1);
}

writeFileSync(outFile, expected, "utf8");
console.log(`openapi.json ditulis (${Buffer.byteLength(expected)} bytes).`);
