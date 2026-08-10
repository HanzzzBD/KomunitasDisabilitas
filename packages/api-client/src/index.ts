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
export { getMe, usersKeys } from "./endpoints/users.js";
export { createSessionRefresher, type SessionRefresherOptions } from "./session.js";
