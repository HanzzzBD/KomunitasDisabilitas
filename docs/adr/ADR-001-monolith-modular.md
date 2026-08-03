# ADR-001 — Monolith Modular vs Microservices

Status: Accepted

Tanggal: 2026-07-15

## Context

Nawasena (PRD §8) dibangun oleh tim 2–5 orang dengan target < 5.000 pengguna terdaftar (~500 DAU) pada tahun pertama, timeline MVP 3–4 bulan, dan anggaran infrastruktur ≤ ~Rp300rb/bulan. Sistem terdiri dari 13 modul resmi (Auth, Users, Accessibility, Profiles, Resumes, Companies, Jobs, Matching, Applications, AI, Notifications, Admin, SignBridge) yang harus bisa berevolusi menuju ekosistem lebih besar (Fase 2–3).

Constraint: satu VPS 4 vCPU/8 GB; tanpa DevOps engineer khusus; kecepatan pengembangan adalah prioritas.

Alternatif yang dipertimbangkan:
1. **Microservices** — isolasi per domain, tetapi menambah biaya operasional (service discovery, distributed tracing, deployment multi-artefak) yang tidak sebanding pada skala ini.
2. **Monolith tanpa struktur** — tercepat di awal, tetapi erosi arsitektur tidak terhindarkan dan pemecahan di masa depan menjadi mahal.
3. **Monolith modular** — satu deployable dengan batas modul tegas yang ditegakkan tooling.

## Decision

Backend Nawasena menggunakan arsitektur **monolith modular**: satu aplikasi API dan satu proses worker dari codebase yang sama, dengan batas modul ditegakkan melalui konvensi lapisan `router → controller → service → repo` dan aturan import `eslint-plugin-boundaries` di CI (SDD §5.1, §15). Antar modul hanya boleh berkomunikasi melalui service layer atau event domain in-process. Microservices ditolak untuk MVP; pemecahan ke service terpisah hanya dilakukan berdasarkan pemicu terukur (SDD §19).

## Consequences

### Positif

* Satu artefak deploy → CI/CD, debugging, dan operasional sederhana untuk tim kecil.
* Transaksi database lintas modul tetap ACID tanpa saga/distributed transaction.
* Batas modul yang tegas membuat pemecahan ke service (bila terbukti perlu) murah — kontrak event sudah stabil.

### Negatif

* Satu bug fatal dapat menjatuhkan seluruh API (blast radius satu proses).
* Scaling hanya bisa per-keseluruhan-aplikasi, bukan per modul.
* Disiplin batas modul bergantung pada tooling dan review, bukan isolasi runtime.

### Mitigasi

* Lint boundaries sebagai gate CI merah — pelanggaran batas modul menggagalkan build (SDD §5.1).
* API stateless + healthcheck → replika API ganda di compose sejak awal (SDD §9.2).
* Jalur pemecahan terdokumentasi dengan pemicu terukur di SDD §19; SignBridge v2 sudah dirancang sebagai service terpisah sejak kontrak (ADR-010).

## Referensi

PRD §8; SDD §3, §5, §15, §19. Terkait: ADR-002, ADR-006, ADR-010, ADR-012.
