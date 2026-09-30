// Skor + alasan kecocokan — isi `pembuka` kartu lowongan di feed (PR-074).
//
// AC "Skor bukan warna-saja": skor SELALU tertulis sebagai angka DAN label
// ("Kecocokan 73% — cocok"). Bar di bawahnya hanya penguat visual — satu warna,
// panjangnya yang bermakna, dan `aria-hidden` karena teks di atasnya sudah
// mengatakan hal yang sama. Screen reader mendengar kalimatnya satu kali.
//
// MODE TEKS SEDERHANA MENYEMBUNYIKAN ELEMEN SEKUNDER (mitigasi risiko
// "informasi kartu padat → overload", persona Dimas): bar visual dan catatan
// "Alasan disusun AI" tidak dirender. Yang tersisa: judul, tingkat kecocokan,
// alasan, info lowongan, dan tautannya.
//
// Alasan dari AI dan dari template tampil SAMA — kontrak API-nya identik
// (PR-073). Bedanya hanya satu catatan kecil bertuliskan, bukan ikon.
import type { MatchItem } from "@nawasena/schemas";
import { useModeBahasa, useTeks, type KunciTeks } from "../../shared/i18n/index.js";

/**
 * Batas tingkat kecocokan. Skor deterministik PR-071 pada data nyata jatuh di
 * sekitar 0,55–0,70 (log PR-071), jadi batasnya dipilih supaya tiga label itu
 * benar-benar terpakai — bukan semuanya "mungkin cocok".
 */
export const BATAS_TINGKAT = { tinggi: 0.7, sedang: 0.55 } as const;

export function kunciTingkat(skor: number): KunciTeks {
  if (skor >= BATAS_TINGKAT.tinggi) return "beranda.feed.kartu.tingkat.tinggi";
  if (skor >= BATAS_TINGKAT.sedang) return "beranda.feed.kartu.tingkat.sedang";
  return "beranda.feed.kartu.tingkat.rendah";
}

export function persenSkor(skor: number): number {
  return Math.round(Math.min(1, Math.max(0, skor)) * 100);
}

export interface KecocokanProps {
  item: Pick<MatchItem, "score" | "explanation" | "explanationSource">;
}

export function Kecocokan({ item }: KecocokanProps) {
  const t = useTeks();
  const { mode } = useModeBahasa();
  const sederhana = mode === "id-simple";
  const persen = persenSkor(item.score);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold text-gray-900">
        {t("beranda.feed.kartu.skor", { persen, tingkat: t(kunciTingkat(item.score)) })}
      </p>
      {sederhana ? null : (
        // SVG ber-ATRIBUT, bukan `style` inline: repo ini tidak memakai gaya
        // inline di mana pun (siap untuk CSP tanpa `unsafe-inline`).
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 100 4"
          preserveAspectRatio="none"
          className="h-2 w-full max-w-xs"
        >
          <rect width="100" height="4" rx="2" className="fill-gray-200" />
          <rect width={persen} height="4" rx="2" className="fill-gray-900" />
        </svg>
      )}
      <p className="text-base text-gray-900">
        <span className="font-semibold">{t("beranda.feed.kartu.alasanLabel")}</span>{" "}
        {item.explanation}
      </p>
      {!sederhana && item.explanationSource === "ai" ? (
        <p className="text-sm text-gray-700">{t("beranda.feed.kartu.dariAi")}</p>
      ) : null}
    </div>
  );
}
