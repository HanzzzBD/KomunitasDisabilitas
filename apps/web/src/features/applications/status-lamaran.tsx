// Status lamaran dari sisi PELAMAR (PR-079) — label, arti, dan badge.
//
// TEKS ADALAH SUMBER KEBENARANNYA, warna hanya penguat (WCAG 1.4.1) — pola
// sama `admin/lamaran-status-badge.tsx`, tetapi dengan label untuk pelamar
// (katalog `pelamar`), bukan istilah operasional admin.
import type { ApplicationStatus } from "@nawasena/schemas";
import { gabungKelas } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";

export const KUNCI_STATUS_PELAMAR: Readonly<Record<ApplicationStatus, KunciTeks>> = {
  submitted: "pelamar.status.submitted",
  viewed: "pelamar.status.viewed",
  in_review: "pelamar.status.in_review",
  interview: "pelamar.status.interview",
  offered: "pelamar.status.offered",
  hired: "pelamar.status.hired",
  rejected: "pelamar.status.rejected",
  withdrawn: "pelamar.status.withdrawn",
};

export const KUNCI_ARTI_STATUS: Readonly<Record<ApplicationStatus, KunciTeks>> = {
  submitted: "pelamar.arti.submitted",
  viewed: "pelamar.arti.viewed",
  in_review: "pelamar.arti.in_review",
  interview: "pelamar.arti.interview",
  offered: "pelamar.arti.offered",
  hired: "pelamar.arti.hired",
  rejected: "pelamar.arti.rejected",
  withdrawn: "pelamar.arti.withdrawn",
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

export function StatusLamaranBadge({
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
      {t(KUNCI_STATUS_PELAMAR[status])}
    </span>
  );
}
