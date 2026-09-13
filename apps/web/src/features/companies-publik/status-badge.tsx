// Badge status verifikasi — versi PUBLIK (PR-054, Gap G5).
//
// TERPISAH dari `features/admin/companies-status-badge.tsx`, dengan alasan
// yang sama dengan katalognya: halaman ini dibuka kandidat tanpa sesi
// (US-09), dan meminjam komponen admin akan menyeret katalog `admin` yang
// tidak pernah dipakai halaman ini.
//
// TEKS ADALAH SUMBER KEBENARANNYA, warna hanya penguat (AC PR-054: "Badge
// verified vs self-claimed dibedakan tekstual, bukan warna saja") — pola sama
// dengan versi admin. Ditambah SATU kalimat penjelasan di bawah pil: audiens
// di sini kandidat yang menilai perusahaan, bukan admin yang mengurasinya, dan
// kata tunggal "Klaim mandiri" tidak menjelaskan APA ARTINYA itu bagi mereka.
import type { InclusivityStatus } from "@nawasena/schemas";
import { gabungKelas } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";

const KUNCI_PIL: Readonly<Record<InclusivityStatus, KunciTeks>> = {
  verified: "companies.status.verified",
  self_claimed: "companies.status.selfClaimed",
  unverified: "companies.status.unverified",
};

const KUNCI_PENJELASAN: Readonly<Record<InclusivityStatus, KunciTeks>> = {
  verified: "companies.status.penjelasan.verified",
  self_claimed: "companies.status.penjelasan.selfClaimed",
  unverified: "companies.status.penjelasan.unverified",
};

/** Kontras teks ≥ 4,5:1 di ketiganya, diukur di lapis browser (PR-031b). */
const KELAS: Readonly<Record<InclusivityStatus, string>> = {
  verified: "border-green-700 bg-green-50 text-green-900",
  self_claimed: "border-amber-700 bg-amber-50 text-amber-900",
  unverified: "border-gray-400 bg-gray-50 text-gray-700",
};

export interface StatusBadgePublikProps {
  status: InclusivityStatus;
  className?: string;
}

export function StatusBadgePublik({ status, className }: StatusBadgePublikProps) {
  const t = useTeks();

  return (
    <div className={gabungKelas("flex flex-col items-start gap-1", className)}>
      <span
        className={gabungKelas(
          "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
          KELAS[status],
        )}
      >
        {t(KUNCI_PIL[status])}
      </span>
      <p className="text-sm text-gray-700">{t(KUNCI_PENJELASAN[status])}</p>
    </div>
  );
}
