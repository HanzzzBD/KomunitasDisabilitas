// Permukaan publik features/admin (PR-053) — dipakai routes/admin-companies*.tsx.
export {
  NILAI_KOSONG,
  keNilai,
  keBadanBuat,
  keBadanUbah,
  type NilaiPerusahaan,
} from "./companies-badan.js";
export { StatusBadge, type StatusBadgeProps } from "./companies-status-badge.js";
export {
  FormulirPerusahaan,
  type FormulirPerusahaanProps,
} from "./companies-formulir.js";
export { DaftarPerusahaan, type DaftarPerusahaanProps } from "./companies-daftar.js";
export {
  pesanGalatSimpan,
  periksa,
  type GalatKolom,
} from "./companies-pesan-galat.js";
