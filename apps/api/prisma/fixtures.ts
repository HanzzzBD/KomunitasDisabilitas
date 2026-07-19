// Fixture ID STABIL untuk seed dev & E2E (PR-012).
//
// ATURAN (lihat prisma/FIXTURES.md):
// - JANGAN pernah mengubah UUID yang sudah ada — E2E bergantung padanya.
// - Menambah entitas baru boleh; ikuti pola penomoran blok di bawah.
// - Format valid UUID v7 (versi 7, varian 8) dengan timestamp beku
//   2026-01-01T00:00:00Z (0x01941999f400) — sortable & lolos validasi,
//   segmen akhir readable per blok entitas.
const T = "01941999-f400-7000-8000";

export const FIXTURE = {
  users: {
    /// Admin dev (dibuat seed sejak PR-009; phone +620000000001)
    admin: `${T}-000000000001`,
    /// Rina — Tuli, BISINDO, desain grafis, Jakarta (PRD Persona 1)
    rina: `${T}-000000000011`,
    /// Bayu — Netra, screen reader, admin/CS/penulisan, Yogyakarta (Persona 2)
    bayu: `${T}-000000000012`,
    /// Sari — Daksa, kursi roda, keuangan, remote/hybrid (Persona 3)
    sari: `${T}-000000000013`,
    /// Dimas — Autisme, QA/data entry, teliti (Persona 4)
    dimas: `${T}-000000000014`,
  },
  companies: {
    inklusifTech: `${T}-000000000101`, // verified, akomodasi lengkap
    kreatifStudio: `${T}-000000000102`, // verified, ramah Tuli
    dataNusantara: `${T}-000000000103`, // self_claimed, remote-first
    tokoBerkah: `${T}-000000000104`, // self_claimed, retail
    warungDigital: `${T}-000000000105`, // unverified
  },
  /// 20 jobs: j01–j20 → …0201–0220 (variasi work_mode × akomodasi × status).
  jobs: Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [
      `j${String(i + 1).padStart(2, "0")}`,
      `${T}-0000000002${String(i + 1).padStart(2, "0")}`,
    ]),
  ) as Record<string, string>,
  resumes: {
    rina: `${T}-000000000301`,
    bayu: `${T}-000000000302`,
    sari: `${T}-000000000303`,
    dimas: `${T}-000000000304`,
  },
  applications: {
    rinaKeJ01: `${T}-000000000401`, // submitted
    bayuKeJ05: `${T}-000000000402`, // in_review
    bayuKeJ06: `${T}-000000000403`, // submitted
    sariKeJ09: `${T}-000000000404`, // hired + hired_confirmed_at (North Star)
    dimasKeJ13: `${T}-000000000405`, // interview
    dimasKeJ14: `${T}-000000000406`, // rejected
  },
} as const;

/// Nomor HP fixture — prefix +62115xxx (dummy jelas, bukan rentang operator nyata).
export const FIXTURE_PHONES = {
  rina: "+621150000011",
  bayu: "+621150000012",
  sari: "+621150000013",
  dimas: "+621150000014",
} as const;
