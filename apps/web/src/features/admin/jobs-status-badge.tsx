// Badge status lowongan — pola sama `companies-status-badge.tsx` (AC PR-053
// "Badge status jelas + tekstual", diwarisi objective PR-057 "daftar dengan
// filter status").
//
// TEKS ADALAH SUMBER KEBENARANNYA, warna hanya penguat — alasan yang sama
// persis dengan `StatusBadge` companies: WCAG 1.4.1, tiga status dibedakan
// KATA, bukan warna yang sama-sama dibaca "Badge" oleh screen reader.
import type { JobStatus } from "@nawasena/schemas";
import { gabungKelas } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";

const KUNCI: Readonly<Record<JobStatus, KunciTeks>> = {
  draft: "admin.jobs.status.draft",
  published: "admin.jobs.status.published",
  closed: "admin.jobs.status.closed",
};

/** Kontras teks ≥ 4,5:1 di ketiganya — pola sama companies, diukur di lapis browser (PR-031b). */
const KELAS: Readonly<Record<JobStatus, string>> = {
  draft: "border-gray-400 bg-gray-50 text-gray-700",
  published: "border-green-700 bg-green-50 text-green-900",
  closed: "border-amber-700 bg-amber-50 text-amber-900",
};

export interface JobStatusBadgeProps {
  status: JobStatus;
  className?: string;
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
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
