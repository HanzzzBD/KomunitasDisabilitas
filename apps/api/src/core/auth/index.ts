// core/auth — sesi & token (PR-018). RBAC + registry menyusul di PR-019.
//
// PENTING: barrel ini di-import STATIS dari index.ts (gerbang fail-fast kunci
// sesi). Jangan pernah menambahkan export yang menyentuh `@prisma/client` di
// sini — import Prisma memuat .env sebagai efek samping dan akan melangkahi
// seluruh gerbang boot (lihat catatan di index.ts, diuji crypto-boot.test.ts).
export { parseSessionKeys, SessionKeyError, type SessionKeys } from "./keys.js";
export {
  createTokenService,
  SESSION_POLICY,
  type AccessClaims,
  type RefreshMaterial,
  type TokenService,
} from "./tokens.js";
