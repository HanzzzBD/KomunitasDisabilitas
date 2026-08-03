# ADR-013 — Scope Desain: MVP Rinci + Reserved Boundaries untuk Ekosistem

Status: Accepted

Tanggal: 2026-07-15

## Context

Visi Nawasena (Deskripsi) mencakup ekosistem penuh: forum komunitas, mentoring, pelatihan, webinar, AI Interview Simulator, dan SignBridge. PRD membaginya ke Fase 1–3. Mendesain rinci seluruh ekosistem sekarang menghasilkan desain spekulatif untuk fitur yang belum tervalidasi; mengabaikannya menghasilkan arsitektur yang harus dirombak saat fitur tiba.

Constraint: Master Instruction melarang penghapusan fitur roadmap; tim harus tetap fokus pada MVP 3–4 bulan.

Alternatif yang dipertimbangkan:
1. **Desain penuh ekosistem sekarang** — dokumen besar, sebagian besar spekulatif.
2. **Desain MVP saja tanpa mempertimbangkan ekosistem** — risiko rombak arsitektur di Fase 2–3.
3. **MVP rinci + titik ekstensi terdefinisi** — desain mendalam hanya untuk yang dibangun sekarang.

## Decision

SDD dan seluruh artefak teknis mendesain **rinci hanya Fase 1 (MVP)**. Fitur ekosistem Fase 2–3 dipertahankan sebagai **reserved boundaries**: nama modul dicadangkan (`employers`, `reviews`, `interviews`, `forum`, `mentoring`, `trainings`, `signbridge-v2`), kontrak event domain distabilkan sejak sekarang, dan tabel Fase 2+ dicantumkan sebagai reserved tanpa dibuat (SDD §6.1, §15). Fitur roadmap tidak dihapus; desain rincinya dibuat melalui SDD lanjutan saat fase-nya tiba.

## Consequences

### Positif

* Dokumen tetap actionable — setiap bagian SDD dapat langsung diimplementasikan.
* Arsitektur MVP tidak menghalangi ekosistem: modul baru masuk sebagai modul monolith mengikuti konvensi yang sama.
* Roadmap produk utuh dan tertelusuri (Master Instruction terpenuhi).

### Negatif

* Fitur Fase 2–3 membutuhkan siklus desain tambahan sebelum implementasi.
* Risiko kontrak event yang distabilkan sekarang ternyata kurang untuk kebutuhan fitur mendatang.

### Mitigasi

* Event domain bersifat additive — payload boleh bertambah field tanpa breaking (SDD §5.3).
* Review arsitektur ringan tiap akhir fase untuk memvalidasi reserved boundaries terhadap pembelajaran terbaru.

## Referensi

Deskripsi Nawasena; PRD §14; SDD §1, §6.1, §15, §19. Terkait: ADR-001, ADR-010.
