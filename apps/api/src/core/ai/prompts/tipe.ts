// core/ai/prompts — kontrak tipe registry prompt (PR-044a, SDD §7.3).
//
// Berkas ini TANPA logika: ia hanya menuliskan bentuk template dan satu aturan
// privasi yang ditegakkan `tsc`, bukan review.
//
// ATURAN PRIVASINYA (dan batasnya). SDD §7.3 berbunyi: prompt tidak pernah
// memuat `disability_types` mentah; yang boleh dikirim hanya KEBUTUHAN
// AKOMODASI fungsional, itu pun bila fitur memerlukannya dan pengguna sudah
// consent. `TanpaDisabilitas` mengkodekan persis kalimat itu — bukan versi yang
// lebih tumpul darinya. Menolak seluruh `SensitiveProfile` (yang membundel
// KEDUA field) akan memblokir jalur yang SDD sahkan, dan PR fitur berikutnya
// terpaksa MELEMAHKAN guard ini — persis saat guard biasanya dilemahkan dengan
// buruk. Lihat log implementasi PR-044a: penyempitan ini keputusan tertulis.
//
// **Ini tripwire NAMA, bukan bukti aliran data.** Ia tidak menghentikan
// `catatan: "saya Tuli"` yang mengalir lewat sebuah field `string`. Karena itu
// penjaga jangkauan (`__tests__/prompt-sensitif-jangkauan.test.ts`) dan
// `docs/akses-data-sensitif.md` tetap berlaku di atasnya.
import type { ZodType } from "zod";
import type { AiChatMessage, AiChatRequest } from "../types.js";

/**
 * Nama field yang TIDAK boleh muncul di masukan prompt, dalam kedua ejaan yang
 * hidup di repo ini: camelCase (zod/TypeScript) dan snake_case (kolom DB).
 */
export type KunciDisabilitas = "disabilityTypes" | "disability_types";

/**
 * Peta `T` dengan setiap kunci disabilitas dipaksa menjadi `never`, REKURSIF
 * menembus objek dan larik.
 *
 * Rekursif karena kebocoran yang nyata hampir selalu bersarang: yang ditulis
 * orang bukan `{ disabilityTypes }` telanjang melainkan
 * `{ profil: { sensitive: SensitiveProfile } }`. Constraint yang hanya melihat
 * lapisan pertama akan meloloskannya dan terbaca seolah-olah menjaga.
 *
 * Dipakai sebagai batas generic: `Input extends TanpaDisabilitas<Input>`.
 * Efeknya, tipe yang membawa `disabilityTypes: DisabilityType[]` tidak
 * assignable ke `never` → typecheck merah **di titik DEFINISI template**,
 * tempat kesalahannya dibuat, bukan tersebar di setiap tempat panggilan.
 *
 * Catatan sifat TypeScript yang harus diketahui: `any` MELEWATI batas apa pun,
 * termasuk yang ini. `Input` bertipe `any` karena itu bukan "lolos guard",
 * melainkan guard yang dimatikan — dan ia terlihat sebagai satu kata di berkas
 * template.
 */
/**
 * Benar bila `T` punya index signature string/number.
 *
 * Tipe seperti `Record<string, unknown>` MEMUAT `disabilityTypes` — kuncinya
 * hanya belum disebutkan. Pemetaan bersyarat di bawah tidak akan pernah
 * menolaknya (tidak ada kunci harfiah untuk dicocokkan), jadi tanpa pemeriksaan
 * ini `Input = Record<string, unknown>` adalah pintu terbuka yang melewati
 * seluruh guard — dan pintu yang tidak dilihat satu pun test, sebab penjaga
 * jangkauan hanya memindai `prompts/**`, bukan tempat panggilan.
 */
type PunyaIndexSignature<T> = string extends keyof T
  ? true
  : number extends keyof T
    ? true
    : false;

export type TanpaDisabilitas<T> = T extends Date
  ? // Hentikan rekursi pada Date: memetakan propertinya mengubah objek waktu
    // menjadi objek pemetaan yang tidak lagi assignable ke Date.
    T
  : T extends readonly (infer U)[]
    ? readonly TanpaDisabilitas<U>[]
    : T extends object
      ? PunyaIndexSignature<T> extends true
        ? // Sengaja `never`: bentuk ber-index-signature ditolak SELURUHNYA,
          // bukan dipetakan. Masukan prompt harus berupa bentuk yang kuncinya
          // disebutkan — hanya bentuk itu yang bisa dijamin tidak memuat data
          // disabilitas.
          never
        : { [K in keyof T]: K extends KunciDisabilitas ? never : TanpaDisabilitas<T[K]> }
      : T;

/**
 * Bentuk penegakan `TanpaDisabilitas` yang bisa dipakai TypeScript.
 *
 * Bentuk yang paling wajar — `Input extends TanpaDisabilitas<Input>` — ditolak
 * kompiler dengan `TS2313: Type parameter 'Input' has a circular constraint`,
 * karena batasnya adalah tipe kondisional atas parameter yang sama. Jadi
 * pemeriksaannya dipindah dari posisi BATAS ke posisi ARGUMEN: `definePrompt`
 * meminta `PromptSpec<…> & PeriksaTanpaDisabilitas<Input>`.
 * - Lolos → `unknown`, dan `X & unknown` tetap `X` (tanpa efek samping).
 * - Gagal → objek dengan properti WAJIB bertipe `never`, yang mustahil dipenuhi
 *   literal spec mana pun. Nama propertinya sengaja menjadi pesan errornya.
 */
export type PeriksaTanpaDisabilitas<T> =
  T extends TanpaDisabilitas<T>
    ? unknown
    : { readonly MASUKAN_PROMPT_TIDAK_BOLEH_MEMUAT_DATA_DISABILITAS_SDD_7_3: never };

/**
 * Identitas satu template — bagian yang bisa disimpan di registry tanpa tipe.
 *
 * `id` ADALAH nilai `ai_usage.prompt_version`. Ia sengaja sama persis dengan
 * basename berkasnya (`spesimen.v1` ⇄ `spesimen.v1.ts`) supaya satu baris di
 * tabel biaya bisa ditelusuri ke tepat satu berkas, tanpa perantara.
 */
export interface PromptMeta {
  readonly nama: string;
  readonly versi: number;
  /** `"<nama>.v<versi>"` — dipakai apa adanya sebagai `promptVersion`. */
  readonly id: string;
}

/**
 * Template prompt berversi.
 *
 * `output` sudah MEMBAWA sanitasi keluaran di dalamnya (`.transform`), jadi
 * meneruskannya ke `AiProvider.chatJson`/`AiClient.json` sudah cukup — tidak
 * ada langkah "ingat bersihkan" yang bisa dilupakan siapa pun.
 */
export interface PromptTemplate<Input, Output> extends PromptMeta {
  /** Instruksi sistem template, sesudah `INSTRUKSI_ANTI_INJEKSI`. */
  readonly system: string;
  readonly fewShot: readonly AiChatMessage[];
  readonly output: ZodType<Output>;
  /** Rakit permintaan chat; data tak tepercaya dibungkus di sini, bukan oleh pemanggil. */
  bangun(input: Input): AiChatRequest;
}
