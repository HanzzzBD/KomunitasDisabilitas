// @nawasena/api-client — typed client dari kontrak zod (ADR-014, SDD §11).
// Bebas dependensi DOM: jalan di browser, React Native, dan Node ≥ 18.
export {
  createApiClient,
  type ApiClient,
  type ApiClientOptions,
  type RequestOptions,
} from "./client.js";
export { ApiError, JARINGAN_GAGAL, RESPONS_TIDAK_DIKENAL, toErrorEnvelope } from "./errors.js";
export { queryKey, type QueryKey, type QueryParams } from "./query-keys.js";
export {
  requestOtp,
  verifyOtp,
  googleAuth,
  refreshSession,
  logout,
  logoutAll,
  authKeys,
} from "./endpoints/auth.js";
export { getMe, exportMe, usersKeys } from "./endpoints/users.js";
export {
  getAccessibility,
  updateAccessibility,
  accessibilityKeys,
} from "./endpoints/accessibility.js";
export {
  getNotificationPrefs,
  updateNotificationPrefs,
  notificationPrefsKeys,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notificationsKeys,
  type OpsiDaftarNotifikasi,
} from "./endpoints/notifications.js";
export {
  getProfile,
  updateProfile,
  experiencesApi,
  educationsApi,
  skillsApi,
  profilesKeys,
  type BagianKarierApi,
  type BuatPengalaman,
  type UbahPengalaman,
  type BuatPendidikan,
  type UbahPendidikan,
  type BuatKeahlian,
  type UbahKeahlian,
} from "./endpoints/profiles.js";
export { deleteAccount } from "./endpoints/account.js";
export {
  listCompaniesAdmin,
  createCompanyAdmin,
  updateCompanyAdmin,
  verifyCompanyAdmin,
  getCompanyPublic,
  getCompanyActiveJobs,
  companiesKeys,
  type BuatPerusahaan,
  type UbahPerusahaan,
} from "./endpoints/companies.js";
export {
  listJobsAdmin,
  createJobAdmin,
  updateJobAdmin,
  publishJobAdmin,
  closeJobAdmin,
  searchJobs,
  getJobPublic,
  jobsKeys,
  type BuatLowongan,
  type UbahLowongan,
  type OpsiPencarianLowongan,
} from "./endpoints/jobs.js";
export {
  listResumes,
  getResume,
  createResume,
  updateResume,
  deleteResume,
  getResumePdfStatus,
  requestResumePdf,
  resumesKeys,
} from "./endpoints/resumes.js";
export { createSessionRefresher, type SessionRefresherOptions } from "./session.js";
