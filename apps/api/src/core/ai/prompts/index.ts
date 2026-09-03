// core/ai/prompts — registry template prompt berversi (PR-044a, SDD §7.3).
//
// REGISTRY = PETA IDENTITAS, BUKAN PETA PEMANGGILAN. Yang disimpan hanya
// `{nama, versi, id}`. Lookup `string → template bertipe` sengaja TIDAK
// disediakan, dan itu keputusan, bukan kelalaian: ia tidak bisa diketik (setiap
// template punya `Input`/`Output` sendiri), dan begitu ada, ia menjadi pintu
// yang MELANGKAHI batas tipe `TanpaDisabilitas`. Pemanggil fitur mengimpor
// KONSTANTA templatenya (`import { spesimenV1 } from "@/core/ai"`), sehingga
// `Input` dan skema keluarannya tetap terlas ke versinya.
//
// KELENGKAPAN DITEGAKKAN MESIN. `__tests__/prompt-sensitif-jangkauan.test.ts`
// memindai folder ini: setiap berkas `*.v*.ts` wajib terdaftar di bawah, dan
// `id`-nya wajib sama dengan basename berkasnya. Daftar yang dijaga ingatan
// adalah daftar yang suatu saat tertinggal.
//
// ROLLBACK VERSI (spec: "versi prompt lama dapat diaktifkan kembali via
// config") berarti berkas versi lama TETAP ADA dan fitur memilih konstanta yang
// lain — keputusan PR fitur, bukan keputusan berkas ini.
import { spesimenV1 } from "./spesimen.v1.js";
import type { PromptMeta } from "./tipe.js";

export { definePrompt, type PromptSpec } from "./definisi.js";
export type {
  KunciDisabilitas,
  PeriksaTanpaDisabilitas,
  PromptMeta,
  PromptTemplate,
  TanpaDisabilitas,
} from "./tipe.js";
export {
  spesimenKeluaranSchema,
  spesimenV1,
  type SpesimenInput,
  type SpesimenKeluaran,
} from "./spesimen.v1.js";

/** Semua template yang hidup di folder ini — sumber tunggal bagi registry. */
const SEMUA: readonly PromptMeta[] = [spesimenV1];

/**
 * Peta `id → identitas`. `id` inilah yang muncul di `ai_usage.prompt_version`
 * (PR-043b), jadi satu nilai di kolom itu memetakan ke tepat satu berkas.
 */
export const PROMPT_REGISTRY: Readonly<Record<string, PromptMeta>> = Object.freeze(
  Object.fromEntries(
    SEMUA.map((meta) => [meta.id, { nama: meta.nama, versi: meta.versi, id: meta.id }]),
  ),
);
