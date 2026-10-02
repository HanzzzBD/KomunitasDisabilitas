// modules/applications — mesin status lamaran (PR-076).
//
// Aturannya kini hidup di `@nawasena/schemas` (applications-api.ts, PR-077b)
// supaya web menawarkan tujuan yang SAMA dengan yang ditegakkan server. Berkas
// ini mempertahankan nama yang sudah dipakai modul (dan test PR-076) — satu
// sumber kebenaran, dua nama.
export {
  ALUR_STATUS_LAMARAN as ALUR_STATUS,
  STATUS_LAMARAN_AKHIR as STATUS_AKHIR,
  bolehPindahStatus as bolehPindah,
  statusLamaranAktif as statusAktif,
  type PeranPemindahStatus as PeranPemindah,
} from "@nawasena/schemas";
