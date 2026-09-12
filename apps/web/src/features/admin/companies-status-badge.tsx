// Badge status verifikasi — AC PR-053: "Badge status jelas + tekstual".
//
// TEKS ADALAH SUMBER KEBENARANNYA, warna hanya penguat. Tiga status dibedakan
// KATA yang berbeda ("Terverifikasi" / "Klaim mandiri" / "Belum diverifikasi"),
// bukan warna yang sama-sama dibaca "Badge" oleh screen reader — pelanggaran
// WCAG 1.4.1 yang paling lazim pada komponen status.
import type { InclusivityStatus } from "@nawasena/schemas";
import { gabungKelas } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";

const KUNCI: Readonly<Record<InclusivityStatus, KunciTeks>> = {
  verified: "admin.companies.status.verified",
  self_claimed: "admin.companies.status.selfClaimed",
  unverified: "admin.companies.status.unverified",
};

/**
 * Warna PENGUAT, bukan penanda utama (lihat catatan di atas). Kontras teks
 * ≥ 4,5:1 di ketiganya — angka pastinya diukur di lapis browser (PR-031b),
 * sama seperti seluruh warna lain di aplikasi ini.
 */
const KELAS: Readonly<Record<InclusivityStatus, string>> = {
  verified: "border-green-700 bg-green-50 text-green-900",
  self_claimed: "border-amber-700 bg-amber-50 text-amber-900",
  unverified: "border-gray-400 bg-gray-50 text-gray-700",
};

export interface StatusBadgeProps {
  status: InclusivityStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const t = useTeks();

  return (
    <span
      className={gabungKelas(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
        KELAS[status],
        className,
      )}
    >
      {t(KUNCI[status])}
    </span>
  );
}
