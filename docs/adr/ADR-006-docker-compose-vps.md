# ADR-006 — Docker Compose pada VPS sebagai Platform Deployment

Status: Accepted

Tanggal: 2026-07-15

## Context

Nawasena harus berjalan dengan biaya infrastruktur ≤ ~Rp300rb/bulan pada fase validasi (< 5.000 pengguna), dioperasikan tim 2–5 orang tanpa DevOps khusus, dengan target ketersediaan 99%, RPO ≤ 24 jam, RTO ≤ 4 jam (PRD §7). Dibutuhkan environment produksi dan staging.

Constraint: pemilik produk memilih VPS sendiri (bukan PaaS/managed cloud) pada discovery PRD.

Alternatif yang dipertimbangkan:
1. **PaaS (Railway/Render/Fly.io)** — deploy termudah, tetapi ditolak pada discovery; biaya per-service membengkak dengan Postgres+Redis+worker.
2. **Kubernetes (k3s) di VPS** — orkestrasi penuh, tetapi kompleksitas operasional tidak sebanding untuk satu host.
3. **Docker Compose di VPS** — deklaratif, ringan, cukup untuk topologi satu host.

## Decision

Nawasena di-deploy menggunakan **Docker Compose pada satu VPS Ubuntu LTS** (4 vCPU/8 GB): produksi dan staging sebagai **compose project terpisah** (`nawasena-prod`, `nawasena-stg`) dengan database, kredensial, dan kuota AI terpisah, di belakang satu Nginx + Cloudflare. Setiap container memiliki resource limit eksplisit (SDD §9.2). Image di-pin per digest dari GHCR; deploy dan rollback melalui skrip `deploy.sh` yang dipicu CI (ADR-016). Provisioning VPS dikodifikasi di `infra/provision.sh` (idempotent).

## Consequences

### Positif

* Biaya total infrastruktur ~Rp150–250rb/bulan — sesuai constraint PRD.
* Topologi sederhana yang dapat dipahami penuh oleh seluruh tim; debugging langsung di satu host.
* Staging yang menyerupai produksi tanpa biaya host tambahan.

### Negatif

* Satu VPS adalah single point of failure (Risiko T3 SDD §20) — kegagalan host menjatuhkan prod dan staging sekaligus.
* Tidak ada autoscaling; kapasitas dibatasi spesifikasi host.
* Isolasi prod/staging hanya setingkat container dan resource limit, bukan host terpisah.

### Mitigasi

* Backup harian terenkripsi ke R2 + restore drill bulanan wajib; DR terdokumentasi dengan RTO ≤ 4 jam via `provision.sh` (SDD §18).
* Jalur skala berbasis pemicu terukur: pisah DB → worker di host kedua → multi-VPS (SDD §19).
* Resource limit per container mencegah satu komponen (Puppeteer) memakan host (SDD §9.2).

## Referensi

PRD §7–8; SDD §9, §10, §18, §19. Terkait: ADR-001, ADR-016.
