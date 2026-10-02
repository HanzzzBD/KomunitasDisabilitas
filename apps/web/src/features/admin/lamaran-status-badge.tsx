// Badge status lamaran (PR-077b) — pola sama `jobs-status-badge.tsx`.
//
// TEKS ADALAH SUMBER KEBENARANNYA, warna hanya penguat (WCAG 1.4.1). Delapan
// status dibedakan KATA; warna hanya mengelompokkan tiga keadaan: berjalan
// (abu), berhasil (hijau), dan berakhir tanpa hasil (kuning).
import type { ApplicationStatus } from "@nawasena/schemas";
import { gabungKelas } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";

export const KUNCI_STATUS_LAMARAN: Readonly<Record<ApplicationStatus, KunciTeks>> = {
  submitted: "admin.lamaran.status.submitted",
  viewed: "admin.lamaran.status.viewed",
  in_review: "admin.lamaran.status.in_review",
  interview: "admin.lamaran.status.interview",
  offered: "admin.lamaran.status.offered",
  hired: "admin.lamaran.status.hired",
  rejected: "admin.lamaran.status.rejected",
  withdrawn: "admin.lamaran.status.withdrawn",
};

const BERJALAN = "border-gray-400 bg-gray-50 text-gray-700";
const BERHASIL = "border-green-700 bg-green-50 text-green-900";
const BERAKHIR = "border-amber-700 bg-amber-50 text-amber-900";

const KELAS: Readonly<Record<ApplicationStatus, string>> = {
  submitted: BERJALAN,
  viewed: BERJALAN,
  in_review: BERJALAN,
  interview: BERJALAN,
  offered: BERHASIL,
  hired: BERHASIL,
  rejected: BERAKHIR,
  withdrawn: BERAKHIR,
};

export function LamaranStatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  const t = useTeks();
  return (
    <span
      className={gabungKelas(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
        KELAS[status],
        className,
      )}
    >
      {t(KUNCI_STATUS_LAMARAN[status])}
    </span>
  );
}
