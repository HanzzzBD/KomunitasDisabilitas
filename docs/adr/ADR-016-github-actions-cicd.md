# ADR-016 — GitHub Actions CI/CD dengan Accessibility sebagai Quality Gate

Status: Accepted

Tanggal: 2026-07-15

## Context

WCAG 2.2 AA adalah gate rilis Incasif (PRD §7) dan klaim aksesibilitas yang tidak terbukti adalah risiko produk tertinggi (R3 PRD §17). Kualitas ini tidak dapat dijaga hanya lewat audit manual — harus ditegakkan otomatis pada setiap perubahan kode. Deploy menuju VPS (ADR-006) harus dapat diulang dan dapat di-rollback.

Constraint: gratis untuk tim kecil; mendukung monorepo Turborepo; build Android via EAS.

Alternatif yang dipertimbangkan:
1. **GitLab CI** — setara, tetapi tim memakai GitHub.
2. **Deploy manual via SSH tanpa pipeline** — cepat disiapkan, tetapi tanpa quality gate (termasuk aksesibilitas) dan rawan human error.
3. **GitHub Actions + GHCR + SSH deploy** — terintegrasi penuh dengan repo.

## Decision

CI/CD Incasif menggunakan **GitHub Actions**. Setiap PR menjalankan: lint (eslint + boundaries) → typecheck → unit (Vitest) → API test (Supertest + Postgres service) → e2e ringkas (Playwright) → **a11y gate (axe-core — kegagalan = build merah)** → Lighthouse CI (aksesibilitas = 100, performa ≥ 80). Merge ke main: build image → push GHCR (pin digest) → deploy staging otomatis → smoke test. Tag `v*`: deploy produksi dengan manual approval (GitHub Environment). Rollback via `deploy.sh --rollback` ke digest sebelumnya; migrasi DB wajib backward-compatible satu versi. Build Android dipicu manual per rilis via EAS.

## Consequences

### Positif

* Aksesibilitas tidak dapat "dilewati sementara" — regresi WCAG terdeteksi sebelum merge, bukan saat audit.
* Deploy deterministik by digest → rollback cepat dan pasti.
* Staging selalu mencerminkan main — bug ditemukan sebelum produksi.

### Negatif

* Pipeline penuh memperlambat siklus PR (menit, bukan detik).
* Cek a11y otomatis hanya menangkap sebagian pelanggaran WCAG — memberi rasa aman berlebih bila dianggap satu-satunya kontrol.
* Aturan migrasi backward-compatible menambah disiplin penulisan migrasi.

### Mitigasi

* Turborepo remote caching + test sharding menjaga durasi pipeline wajar.
* Audit manual oleh penguji penyandang disabilitas tetap dijadwalkan per sprint (SDD §20 T10) — otomatis dan manual saling melengkapi.
* Template PR migrasi berisi checklist backward-compatibility.

## Referensi

PRD §7, §17 (R3); SDD §9.3, §10, §20 (T10). Terkait: ADR-006, ADR-015.
