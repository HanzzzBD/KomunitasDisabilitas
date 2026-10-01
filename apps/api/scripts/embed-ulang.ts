// Re-embed massal (PR-069b, utang U-29) — alat operator, juga langkah pemulihan
// "Rollback Strategy" PR-069 ("re-embed massal via job manual").
//
// Hanya MENG-ENQUEUE. Embedding-nya dikerjakan apps/worker lewat pipeline PR-069
// yang sama (kuota → Gemini → jejak biaya). Worker harus menyala agar job-nya
// benar-benar diproses; alat ini tidak menunggunya.
//
// Konfigurasi dibaca lewat gerbang yang SAMA dengan api/worker (`loadEnv`,
// `loadQueueConfigs`, `loadAiQuotaConfig`), jadi berjalan apa adanya di
// kontainer produksi (env dari compose) maupun lokal (`--env-file`).
/* eslint-disable no-console -- script CLI: output ke console adalah antarmukanya */
import { EnvError, loadEnv } from "../src/core/config/index.js";
import { loadAiQuotaConfig } from "../src/core/ai/quota-config.js";
import { createPrismaClient } from "../src/core/db/index.js";
import { createQueueRegistry, loadQueueConfigs } from "../src/core/queue/index.js";
import {
  JARAK_EMBED_ULANG_MS,
  createEmbedUlangService,
  createEmbeddingsRepository,
  maksEmbedUlangBawaan,
} from "../src/modules/matching/index.js";
import {
  ArgumenTidakValidError,
  BANTUAN_EMBED_ULANG,
  bacaArgumenEmbedUlang,
} from "./embed-ulang-argumen.js";

let env;
let queueConfigs;
let quotaConfig;
try {
  env = loadEnv();
  queueConfigs = loadQueueConfigs();
  quotaConfig = loadAiQuotaConfig();
} catch (err) {
  console.error(err instanceof EnvError ? err.message : err);
  process.exit(1);
}

let argumen;
try {
  argumen = bacaArgumenEmbedUlang(process.argv.slice(2), {
    maks: maksEmbedUlangBawaan(quotaConfig.globalPerDay),
    jarakMs: JARAK_EMBED_ULANG_MS,
  });
} catch (err) {
  if (!(err instanceof ArgumenTidakValidError)) throw err;
  console.error(`${err.message}\n\n${BANTUAN_EMBED_ULANG}`);
  process.exit(1);
}
if (argumen.bantuan) {
  console.log(BANTUAN_EMBED_ULANG);
  process.exit(0);
}

const prisma = createPrismaClient();
const queues = createQueueRegistry({
  configs: queueConfigs,
  connection: { url: env.REDIS_QUEUE_URL },
});

try {
  const laporan = await createEmbedUlangService({
    repo: createEmbeddingsRepository(prisma),
    queues,
  }).jalankan(argumen.opsi);

  const kata = laporan.kering ? "akan diantrekan" : "diantrekan";
  console.log(`Re-embed massal${laporan.kering ? " (KERING — tidak ada yang diantrekan)" : ""}`);
  console.log(`  batas jalan ini     : ${laporan.maks}`);
  console.log(`  lowongan ${kata}: ${laporan.lowongan.dipilih}`);
  console.log(`  profil ${kata}  : ${laporan.profil.dipilih}`);
  if (laporan.lowongan.tanpaKurator > 0) {
    console.warn(
      `  PERHATIAN: ${laporan.lowongan.tanpaKurator} lowongan aktif tanpa kurator (createdBy kosong) ` +
        `tidak bisa di-embed dan tidak akan muncul di feed matching — tugaskan kurator lebih dulu.`,
    );
  }
  if (laporan.mungkinMasihAda) {
    console.log("  Batas tercapai; kemungkinan masih ada sisa. Jalankan lagi besok.");
  }
} finally {
  await Promise.allSettled([queues.close(), prisma.$disconnect()]);
}
