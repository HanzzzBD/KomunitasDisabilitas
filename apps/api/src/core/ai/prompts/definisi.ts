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

  return {
    nama: spec.nama,
    versi: spec.versi,
    id: `${spec.nama}.v${spec.versi}`,
    system: spec.system,
    fewShot,
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
