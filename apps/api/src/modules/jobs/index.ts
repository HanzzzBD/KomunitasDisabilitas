// modules/jobs — barrel modul lowongan.
//
// Lahir di PR-024b dengan LAPISAN SERVICE SAJA (penutupan otomatis lowongan
// kedaluwarsa). Router, controller, dan repository menyusul di Phase 08 —
// tidak ada `createJobsModule()` di sini karena belum ada route yang dipasang.
export {
  createJobExpiryService,
  type JobExpiryLimits,
  type JobExpiryReport,
  type JobExpiryService,
} from "./services/expiry.service.js";
