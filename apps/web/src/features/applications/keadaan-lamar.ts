// PR-094: aturan disclosure/CV sama dengan Android. Generator UUID tetap web.
export {
  ISIAN_AWAL,
  cvBawaan,
  dataUntukDiungkap,
  periksaIsian,
  type GalatIsian,
  type IsianLamar,
  type PilihanUngkap,
  type HasilPeriksaLamar as HasilPeriksa,
} from "@nawasena/formulir";

export function kunciIdempotensiBaru(): string {
  return crypto.randomUUID();
}
