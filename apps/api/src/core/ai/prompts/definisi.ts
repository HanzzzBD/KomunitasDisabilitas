// core/ai/prompts — `definePrompt`: satu-satunya cara membuat template prompt
// (PR-044a, SDD §7.3, ADR-012).
//
// KENAPA TEMPLATE, BUKAN `AiClient`, YANG MENEGAKKAN GUARD. Saat sebuah
// `AiChatRequest` sampai di `client.ts`, informasi "bagian mana yang tak
// tepercaya" sudah hilang — yang tersisa hanya array pesan. Template adalah
// satu-satunya tempat data tak tepercaya masih bisa DIKENALI, jadi di sinilah
// batas itu dipasang.
//
// DEFAULT AMAN TERBALIK. Setiap daun string di `Input` dibungkus sebagai data
// tak tepercaya KECUALI kuncinya didaftarkan di `tepercaya`. Menulis nol baris
// menghasilkan perilaku paling aman; satu-satunya kesalahan yang tersisa —
// mempercayai field yang salah — muncul sebagai SATU baris di berkas template,
// tepat tempat review bisa menangkapnya. Guard yang boleh dilupakan pemanggil
// pasti dilupakan, dan repo ini konsisten memilih penegakan struktural
// (boundaries lint, penjaga jangkauan, registry route) daripada ingatan.
//
// HANYA JALUR JSON. `bangun()` menghasilkan `AiChatRequest` yang dipasangkan
// dengan `template.output` di `chatJson`. Jalur teks polos sengaja TIDAK dibuat
// di PR ini: ia punya jahitan sanitasi keluaran yang harus diingat pemanggil,
// dan itu persis bentuk yang dihindari berkas ini.
import { createHash } from "node:crypto";
import { bersihkanKeluaran, bungkusDataTakTepercaya, INSTRUKSI_ANTI_INJEKSI } from "../guard.js";
import type { AiChatMessage, AiChatRequest } from "../types.js";
import type { PeriksaTanpaDisabilitas, PromptTemplate } from "./tipe.js";
import type { ZodType } from "zod";

/** Spesifikasi yang ditulis penulis template. */
export interface PromptSpec<Input, Output> {
  nama: string;
  versi: number;
  /** Instruksi sistem khusus template ini (tanpa bagian anti-injeksi). */
  system: string;
  fewShot?: readonly AiChatMessage[];
  /**
   * Skema keluaran. Sanitasi ditempelkan DI ATASNYA oleh `definePrompt`, jadi
   * penulis template tidak perlu — dan tidak bisa — melupakannya.
   */
  output: ZodType<Output>;
  /**
   * Kunci masukan yang isinya BUKAN data pengguna: konstanta, enum internal,
   * teks yang kita tulis sendiri. Kosongkan bila ragu.
   */
  tepercaya?: readonly (keyof Input)[];
  /** Sumber nonce penanda; disuntik di test. Default `randomUUID`. */
  nonces?: () => string;
  /** Batas panjang per blok data tak tepercaya. */
  maksKarakter?: number;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Nyatakan bahwa entri cache template ini BOLEH dipakai bersama semua
   * pengguna (PR-044b). Absen = per-pengguna, dan itu default-terbalik yang
   * sama seperti `tepercaya`: menulis nol baris jatuh ke sisi aman.
   *
   * Yang disimpan cache adalah JAWABAN AI ATAS MASUKAN — pada produk data
   * disabilitas, entri bersama tanpa syarat adalah kebocoran lintas akun.
   * Karena itu `"bersama"` hanya sah bila SELURUH masukan template memang data
   * publik (mis. daftar lowongan yang di-rerank), bukan sekadar "sepertinya
   * tidak sensitif". Setiap template yang menyetelnya wajib terdaftar berikut
   * alasannya di `__tests__/prompt-cache-lingkup.test.ts` — build merah bila
   * tidak, sebab tidak ada tipe yang bisa membuktikan "ini data publik".
   */
  lingkup?: "bersama";
  /**
   * Umur entri cache dalam detik. Absen = `PROMPT_CACHE_TTL_DEFAULT_DETIK`,
   * dan nilai apa pun dijepit ke `PROMPT_CACHE_TTL_MAKS_DETIK`.
   */
  cacheTtlDetik?: number;
}

/**
 * TTL baku entri cache prompt: satu jam.
 *
 * Cukup lama untuk menangkap pengulangan yang nyata (pengguna memuat ulang
 * halaman, mencoba ulang, membandingkan dua lowongan), cukup pendek untuk tidak
 * menjadi arsip jawaban AI atas data pengguna.
 */
export const PROMPT_CACHE_TTL_DEFAULT_DETIK = 3_600;

/**
 * PLAFON KERAS 24 jam — ini mitigasi PDP, bukan setelan kinerja.
 *
 * `__tests__/purge-kelengkapan.test.ts` hanya memindai model Prisma, jadi
 * penghapusan akun TIDAK menjangkau entri Redis: sebuah entri ber-`userId`
 * bertahan sampai TTL-nya habis atau LRU mengusirnya. Selama tidak ada jalur
 * purge yang menyentuh Redis, satu-satunya batas atas yang kita punya adalah
 * TTL — jadi ia dijepit di sini, di tempat yang tidak bisa dilewati penulis
 * template, alih-alih dipercayakan pada review.
 */
export const PROMPT_CACHE_TTL_MAKS_DETIK = 86_400;

/**
 * Jepit TTL ke rentang yang sah.
 *
 * Batas bawah 1 detik bukan kosmetik: `SET … EX 0` ditolak Redis nyata sebagai
 * "invalid expire time", jadi `cacheTtlDetik: 0` yang lolos ke sini akan
 * mengubah setiap penulisan cache menjadi kegagalan diam (gagal terbuka →
 * selamanya miss). Template yang memang tidak ingin di-cache belum punya cara
 * menyatakannya, dan menyatakannya lewat TTL nol adalah cara yang salah.
 */
function jepitTtl(nilai: number | undefined): number {
  if (nilai === undefined || !Number.isFinite(nilai)) return PROMPT_CACHE_TTL_DEFAULT_DETIK;
  return Math.min(PROMPT_CACHE_TTL_MAKS_DETIK, Math.max(1, Math.trunc(nilai)));
}

/**
 * Sidik bagian STATIS template — lihat `PromptTemplate.sidik`.
 *
 * Bahannya dirakit sebagai LARIK, bukan objek: urutan larik pasti, sedangkan
 * urutan kunci objek adalah urutan penyisipan dan karena itu bisa berubah tanpa
 * ada yang berubah maknanya. `undefined` dipetakan ke `null` supaya
 * `temperature: undefined` dan `temperature: 0` tidak pernah bertemu di satu
 * sidik yang sama.
 *
 * Dipotong 16 heksa (64 bit) karena tugasnya sempit: membedakan segelintir
 * varian dari SATU `id` template. Ia tidak menjaga rahasia apa pun — nilainya
 * hanya turunan teks yang kita tulis sendiri.
 */
function hitungSidik(bahan: {
  id: string;
  system: string;
  fewShot: readonly AiChatMessage[];
  temperature: number | undefined;
  maxOutputTokens: number | undefined;
  tepercaya: readonly string[];
  maksKarakter: number | undefined;
}): string {
  const teks = JSON.stringify([
    bahan.id,
    bahan.system,
    bahan.fewShot.map((pesan) => [pesan.role, pesan.content]),
    bahan.temperature ?? null,
    bahan.maxOutputTokens ?? null,
    // PERTAHANAN ANTI-INJEKSI IKUT MENJADI BAHAN SIDIK. Membuang satu kunci dari
    // `tepercaya` — atau mengecilkan `maksKarakter` — ADALAH perbaikan atas
    // paparan injeksi PR-044a: sejak saat itu field tersebut dibungkus penanda
    // ber-nonce dan dipotong. Tanpa keduanya di sini, perbaikan itu TIDAK
    // menjangkau masukan yang sudah ter-cache sampai TTL-nya habis, dan yang
    // disajikan adalah jawaban yang dihasilkan di bawah pembungkusan yang lebih
    // longgar. DIURUTKAN supaya urutan penulisan daftar tidak mengubah sidik.
    [...bahan.tepercaya].sort(),
    bahan.maksKarakter ?? null,
  ]);
  return createHash("sha256").update(teks, "utf8").digest("hex").slice(0, 16);
}

/**
 * Render satu nilai menjadi teks prompt, membungkus setiap DAUN string dengan
 * `bungkus`. Bentuknya sengaja sederhana (daftar `kunci: nilai`) dan bukan
 * JSON: JSON menuntut model memisahkan tanda kutip milik data dari tanda kutip
 * milik format, dan itu satu ambiguitas lagi yang bisa dieksploitasi.
 */
function render(nilai: unknown, bungkus: (teks: string) => string): string {
  if (typeof nilai === "string") return bungkus(nilai);
  if (nilai === null || nilai === undefined) return "(kosong)";
  if (typeof nilai === "number" || typeof nilai === "boolean") return String(nilai);
  if (nilai instanceof Date) return nilai.toISOString();
  if (Array.isArray(nilai)) {
    if (nilai.length === 0) return "(kosong)";
    return nilai.map((item) => `- ${render(item, bungkus)}`).join("\n");
  }
  if (typeof nilai === "object") {
    return Object.entries(nilai)
      .map(([kunci, isi]) => `${kunci}: ${render(isi, bungkus)}`)
      .join("\n");
  }
  return "(kosong)";
}

/**
 * Buat template prompt berversi.
 *
 * `PeriksaTanpaDisabilitas<Input>` adalah AC-4 dalam bentuk yang gagal saat
 * `tsc --noEmit` berjalan (langkah "Typecheck" di CI), bukan saat seseorang
 * membaca ulang berkas template. `vitest run` TIDAK membuktikannya: esbuild
 * hanya men-transpile.
 */
export function definePrompt<Input, Output>(
  spec: PromptSpec<Input, Output> & PeriksaTanpaDisabilitas<Input>,
): PromptTemplate<Input, Output> {
  const tepercaya = new Set<PropertyKey>(spec.tepercaya ?? []);
  const fewShot = spec.fewShot ?? [];
  const opsiBungkus = {
    ...(spec.nonces === undefined ? {} : { nonces: spec.nonces }),
    ...(spec.maksKarakter === undefined ? {} : { maksKarakter: spec.maksKarakter }),
  };

  const id = `${spec.nama}.v${spec.versi}`;

  return {
    nama: spec.nama,
    versi: spec.versi,
    id,
    system: spec.system,
    fewShot,
    // SEKALI, saat definisi — bukan per panggilan. Template adalah konstanta
    // modul, jadi hash-nya konstanta pula; menghitungnya di jalur panas berarti
    // membayar sha256 atas seluruh `system` + few-shot pada setiap permintaan.
    sidik: hitungSidik({
      id,
      system: spec.system,
      fewShot,
      temperature: spec.temperature,
      maxOutputTokens: spec.maxOutputTokens,
      tepercaya: [...tepercaya].map(String),
      maksKarakter: spec.maksKarakter,
    }),
    lingkup: spec.lingkup ?? "pengguna",
    cacheTtlDetik: jepitTtl(spec.cacheTtlDetik),
    // Sanitasi menumpang `safeParse` yang SUDAH dipanggil adapter
    // (`providers/gemini.ts`), jadi ia berjalan sesudah validasi — urutan yang
    // mengikat, lihat catatan `bersihkanKeluaran`.
    output: spec.output.transform(bersihkanKeluaran),

    bangun(input: Input): AiChatRequest {
      const bagian = Object.entries(input as Record<string, unknown>).map(([kunci, nilai]) => {
        const bungkus = tepercaya.has(kunci)
          ? (teks: string) => teks
          : (teks: string) => bungkusDataTakTepercaya(teks, opsiBungkus);
        return `${kunci}:\n${render(nilai, bungkus)}`;
      });

      const messages: AiChatMessage[] = [
        // Instruksi anti-injeksi SELALU lebih dulu dan SELALU `system`; data
        // tak tepercaya tidak pernah menyentuh peran ini.
        { role: "system", content: `${INSTRUKSI_ANTI_INJEKSI}\n\n${spec.system}` },
        ...fewShot,
        { role: "user", content: bagian.join("\n\n") },
      ];

      return {
        messages,
        ...(spec.temperature === undefined ? {} : { temperature: spec.temperature }),
        ...(spec.maxOutputTokens === undefined ? {} : { maxOutputTokens: spec.maxOutputTokens }),
      };
    },
  };
}
