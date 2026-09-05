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

  it("menolak impor lintas modul yang ditulis dengan penentu `.js` (ESM/NodeNext)", async () => {
    // KASUS REGRESI, dan inilah yang paling penting di berkas ini.
    //
    // SELURUH berkas di `apps/api/src` memakai penentu ber-ekstensi `.js`
    // (NodeNext); tidak satu pun memakai bentuk tanpa ekstensi yang dipakai
    // fixture-fixture di atas. Selama hanya bentuk tanpa ekstensi yang diuji,
    // gerbang ini HIJAU atas kode yang tidak pernah benar-benar diperiksanya:
    // resolver gagal memetakan `.js` ke berkas `.ts` yang ada, dependensinya
    // tidak terklasifikasi, dan `boundaries` melewatinya tanpa sepatah kata.
    //
    // Kegagalan seperti itu tidak pernah merah — jadi tidak ada yang
    // menyelidikinya. Test ini yang membuatnya merah.
    const { ruleIds } = await lintFile(
      "violations/cross-module-repo/src/modules/jobs/services/jobs-esm.service.ts",
    );
    expect(ruleIds).toContain("boundaries/element-types");
  });

  it("menolak impor BARREL modul lain — repository tidak boleh dijangkau lewat pintu belakang", async () => {
    // Penyetelan aturan `module-shared` (lihat boundaries.cjs) mengizinkan
    // `index.ts` menyentuh lapisan modulnya SENDIRI. Test ini menjaga batas
    // penyetelan itu: izin tersebut TIDAK boleh merembet menjadi "modul A boleh
    // impor index modul B". Barrel tiap modul mengekspor ulang repository-nya,
    // jadi jalur itu akan membatalkan seluruh guna aturan nomor 2.
    const { ruleIds } = await lintFile(
      "violations/cross-module-barrel/src/modules/jobs/services/jobs.service.ts",
    );
    expect(ruleIds).toContain("boundaries/element-types");
  });

  it("menolak impor SDK AI di luar core/ai (external)", async () => {
    const { ruleIds } = await lintFile(
      "violations/ai-sdk-outside-core/src/modules/matching/services/matching.service.ts",
    );
    expect(ruleIds).toContain("boundaries/external");
  });

  it("menolak KETIGA SDK yang terdaftar, dan menyebut 'AI Gateway' dalam pesannya", async () => {
    // AC-3 PR-046. Dua hal yang tidak dijaga test di atasnya:
    //
    // (1) JUMLAHNYA. `toContain` hijau bila hanya satu dari tiga penentu yang
    //     tertangkap — dan penentu yang lolos diam-diam adalah persis cara SDK
    //     kedua masuk ke repo tanpa ada yang tahu.
    // (2) PESANNYA. Pengembang yang lint-nya merah membaca pesan itu, bukan
    //     boundaries.cjs. Pesan yang tidak menyebut "AI Gateway" mengubah
    //     gerbang arsitektur menjadi larangan tanpa alasan — dan larangan tanpa
    //     alasan adalah larangan yang dicari cara mengakalinya.
    const { messages } = await lintFile(
      "violations/ai-sdk-outside-core/src/modules/matching/services/matching.service.ts",
    );
    const eksternal = messages.filter(
      (m: Linter.LintMessage) => m.ruleId === "boundaries/external",
    );

    expect(eksternal).toHaveLength(3);
    for (const m of eksternal) {
      expect(m.message).toContain("AI Gateway");
      expect(m.severity).toBe(2); // error, bukan warning — build merah
    }
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
      // Akar perakitan modul: menyentuh keempat lapisan modulnya sendiri,
      // dengan penentu `.js` seperti kode sungguhan. Pola inilah yang dipakai
      // keenam modul di apps/api.
      "src/modules/jobs/index.ts",
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
