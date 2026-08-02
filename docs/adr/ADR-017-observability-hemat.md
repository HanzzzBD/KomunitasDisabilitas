# ADR-017 — Observability Hemat: Sentry + Uptime Kuma + pino/Dozzle

Status: Accepted

Tanggal: 2026-07-15

## Context

Nawasena berjalan pada satu VPS 8 GB yang juga menampung staging (ADR-006). Dibutuhkan: error tracking lintas klien-server, alert downtime, log terstruktur tanpa PII, dan metrik dasar (latensi, queue depth, kuota AI) — tanpa memakan RAM yang dibutuhkan aplikasi.

Constraint: stack observability penuh (Prometheus + Grafana + Loki) memakan ratusan MB–GB RAM; anggaran layanan berbayar Rp0.

Alternatif yang dipertimbangkan:
1. **Prometheus + Grafana + Loki self-host** — visibilitas maksimal, tetapi biaya RAM dan pemeliharaan tidak sebanding untuk satu host.
2. **Hanya log file** — hemat total, tetapi debugging produksi lintas klien-server sangat lambat.
3. **Kombinasi layanan free tier + tool self-host ringan.**

## Decision

Observability Nawasena menggunakan: **Sentry** (free tier) untuk error tracking di web, mobile, api, dan worker dengan release tagging + PII scrubbing; **Uptime Kuma** (self-host) untuk probe `/healthz`, `/readyz`, dan halaman publik dengan alert ke Telegram/WhatsApp; **pino** untuk log JSON terstruktur (requestId, userId-hash, redaction PII) dengan rotasi Docker json-file dan **Dozzle** untuk inspeksi; serta endpoint `GET /internal/metrics` (JSON: p95 ring-buffer, queue depth, kuota AI, error rate) yang dipantau Uptime Kuma keyword-monitor untuk ambang alert. Prometheus/Grafana/Loki adalah jalur upgrade dengan pemicu multi-VPS (SDD §19).

## Consequences

### Positif

* Jejak error end-to-end (klien → API → worker) dengan RAM footprint < 300 MB total.
* Alert proaktif untuk kondisi kritis: down, readyz gagal, disk > 80%, backup gagal, DLQ > 0, kuota AI > 90%.
* Log tanpa PII by-design — selaras kewajiban UU PDP.

### Negatif

* Tanpa time-series metrics historis — analisis tren kapasitas terbatas.
* Ketergantungan free tier Sentry (kuota event per bulan).
* Metrik agregat via endpoint internal lebih kasar daripada Prometheus.

### Mitigasi

* `/internal/metrics` menyimpan ring-buffer p95 yang cukup untuk keputusan skala berbasis pemicu (SDD §19).
* Sampling Sentry dikonfigurasi (error selalu, transaction di-sample) agar kuota free tier awet.
* Upgrade path terdokumentasi — migrasi ke Prometheus tidak mengubah kode aplikasi (metrik sudah terstruktur).

## Referensi

SDD §17, §19; PRD §7. Terkait: ADR-006, ADR-016.
