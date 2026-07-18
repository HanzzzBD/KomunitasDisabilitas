---
phase: 11
name: "Matching Engine"
prs: PR-069..PR-074 (6 PR)
sprint: "6-7"
depends_on: [5, 6, 8]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 11 - Matching Engine

## Overview

AI Job Matching end-to-end: embedding pipeline, kandidat pgvector, skor berbobot + hard filter akomodasi, re-rank LLM + cache, endpoint feed dengan degradasi template, dan feed FE.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 05 - User Profile](phase-05-user-profile.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 06 - AI Gateway](phase-06-ai-gateway.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 08 - Companies & Jobs](phase-08-companies-jobs.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-069** - Vektor profil & lowongan selalu segar
* **PR-070** - Query kandidat cepat & aman
* **PR-071** - Mesin skor deterministik
* **PR-072** - Re-rank + penjelasan + cache
* **PR-073** - API feed matching final
* **PR-074** - Beranda matching produksi-ready

## Pull Requests

### PR-069 - Embedding Pipeline (ai:embed)

#### Objective

**Konsumen job.published/profile.updated → embed + invalidasi cache.**

Bisnis: matching selalu memakai data terbaru. Teknis: processor `ai:embed` (Gemini text-embedding 768), batch saat menumpuk, invalidasi `match_scores` terkait; TANPA fallback provider (by design ADR-005) — gagal = retry job.

#### Scope

* Processor embed profil & lowongan
* Invalidasi cache per perubahan

#### Technical Notes

**Backend Changes:**

* Processor worker + wiring event.

**Frontend Changes:**

* Tidak ada.

**AI Changes:**

* Embedding pipeline produksi.

**Database Changes:**

* Tidak ada (kolom vector dari PR-010/011).

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Teks yang di-embed = profil non-sensitif + lowongan (tanpa disability_types — dipastikan builder teks).

**Testing Checklist:**

* [ ] Unit Test (text builder)
* [ ] Integration Test (event→vector, invalidasi)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (staging embed nyata)

**Deliverables:**

* Vektor profil & lowongan selalu segar

**Out of Scope:**

* Query kandidat (PR-070).

**Rollback Strategy:**

RB-Std; re-embed massal via job manual bila perlu.

#### Acceptance Criteria

* [ ] `job.published` → job_embedding terisi (integrasi).
* [ ] `profile.updated` → profile_embedding diperbarui + match_scores user itu terhapus.
* [ ] Teks embed tidak memuat data sensitif (test builder).
* [ ] Gemini down → retry teratur, tidak ada fallback keliru.
* [ ] Batch bekerja saat 50 event beruntun.

#### Dependencies

* PR-041
* PR-055
* PR-038

#### Risks

* Kuota embedding habis saat bulk publish. Mitigasi: batch + antrian + global cap buffer.


### PR-070 - Candidate Query (pgvector + Hard Filter SQL)

#### Objective

**Top-50 cosine + filter work_mode/lokasi ber-parameter.**

Bisnis: kandidat relevan dalam <100 ms. Teknis: `$queryRaw` pgvector (satu-satunya tempat raw SQL vector — terkurung repo matching), filter published/non-expired/work_mode/lokasi di SQL (SDD §7.2).

#### Scope

* Repo matching: query kandidat
* Bukti EXPLAIN HNSW

#### Technical Notes

**Backend Changes:**

* `modules/matching/repo`.

**Frontend Changes:**

* Tidak ada.

**AI Changes:**

* Tidak ada (retrieval murni).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Parameterized penuh (injection test); tidak menyentuh kolom sensitif.

**Testing Checklist:**

* [ ] Unit Test (builder param)
* [ ] Integration Test (pgvector nyata di CI)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (EXPLAIN ANALYZE)

**Deliverables:**

* Query kandidat cepat & aman

**Out of Scope:**

* Skor (PR-071).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] EXPLAIN memakai HNSW (bukti PR).
* [ ] Hanya published & belum expired lolos.
* [ ] Filter work_mode sesuai preferensi user (remote-only → remote/hybrid).
* [ ] p95 < 100 ms pada 1.000 jobs seed.
* [ ] Injection attempt gagal (test).

#### Dependencies

* PR-069

#### Risks

* HNSW recall vs speed tradeoff. Mitigasi: parameter ef_search di config.


### PR-071 - Scoring Service + Accommodation Fit In-Memory

#### Objective

**Skor berbobot config + hard filter akomodasi terdekripsi.**

Bisnis: inti USP — akomodasi wajib user tidak pernah dilanggar feed. Teknis: `score = 0.55*cos + 0.25*fit + 0.10*loc + 0.10*recency` (bobot config); kebutuhan akomodasi (via findProfileSensitive alasan "matching") ⊆ jobs.accommodations dievaluasi in-memory pada top-50 (konsekuensi ADR-007).

#### Scope

* Fungsi skor murni + hard filter akomodasi
* Bobot dari config

#### Technical Notes

**Backend Changes:**

* `modules/matching/score`.

**Frontend Changes:**

* Tidak ada.

**AI Changes:**

* Tidak ada (deterministik).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Akses sensitif via jalur ber-audit (agregasi harian); hasil skor tidak menyimpan alasan sensitif.

**Testing Checklist:**

* [ ] Unit Test (per komponen + property)
* [ ] Integration Test (dengan profil terenkripsi nyata)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (kasus persona seed)

**Deliverables:**

* Mesin skor deterministik

**Out of Scope:**

* Re-rank LLM (PR-072).

**Rollback Strategy:**

RB-Std; bobot revert via env.

#### Acceptance Criteria

* [ ] Lowongan tanpa akomodasi wajib user TIDAK pernah lolos (property test).
* [ ] Tiap komponen skor teruji unit terpisah.
* [ ] Bobot berubah via config tanpa deploy kode (env).
* [ ] User tanpa data akomodasi → fit dianggap netral (tidak menghukum).
* [ ] Deterministik (input sama → skor sama).

#### Dependencies

* PR-070
* PR-039

#### Risks

* Bobot awal tidak optimal. Mitigasi: config + evaluasi dengan data pilot.


### PR-072 - Re-rank LLM + Cache match_scores

#### Objective

**Batch top-20 → urutan + penjelasan 1 kalimat; cache 24 jam.**

Bisnis: feed yang menjelaskan dirinya ("cocok karena…") — kepercayaan pengguna. Teknis: satu panggilan batch per refresh (hemat kuota), prompt rerank.v1 (lowongan = data tak tepercaya), cache `match_scores`, kuota 3 refresh/hari.

#### Scope

* Processor `ai:rerank` + prompt
* Cache + kebijakan refresh

#### Technical Notes

**Backend Changes:**

* Processor + repo match_scores.

**Frontend Changes:**

* Tidak ada.

**AI Changes:**

* Prompt `rerank.v1`; penjelasan Bahasa Indonesia sederhana.

**Database Changes:**

* Tidak ada (match_scores dari PR-011).

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Payload prompt bebas data sensitif (inspeksi test); konten lowongan dibungkus delimiter injection guard.

**Testing Checklist:**

* [ ] Unit Test (parser hasil)
* [ ] Integration Test (cache + kuota + whitelist)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (kualitas penjelasan di staging)

**Deliverables:**

* Re-rank + penjelasan + cache

**Out of Scope:**

* Endpoint feed (PR-073).

**Rollback Strategy:**

RB-Std; rerank dapat dimatikan via flag → template deterministik (PR-073).

#### Acceptance Criteria

* [ ] Request kedua dalam 24 jam → tanpa panggilan LLM (mock counter).
* [ ] Penjelasan ≤ 1 kalimat, bahasa sederhana (validasi panjang + review sampel).
* [ ] Refresh ke-4 dalam sehari → pakai cache + info kuota.
* [ ] Payload prompt diverifikasi bebas field sensitif (test inspeksi).
* [ ] Urutan LLM tidak dapat memasukkan lowongan di luar kandidat (whitelist ID).

#### Dependencies

* PR-071
* PR-044

#### Risks

* LLM menghasilkan penjelasan menyesatkan. Mitigasi: penjelasan dibatasi template konteks + review kualitas berkala.


### PR-073 - GET /me/matches + Template Degradasi

#### Objective

**Endpoint feed: skor+explanation+meta.degraded.**

Bisnis: feed tetap bermakna walau AI mati total (janji degradasi). Teknis: orkestrasi kandidat→filter→skor→(rerank|template deterministik dari komponen skor); kontrak response identik kedua mode.

#### Scope

* Endpoint + orkestrasi + template explanation
* meta.degraded + sisa refresh

#### Technical Notes

**Backend Changes:**

* `modules/matching/{service,router}`.

**Frontend Changes:**

* Tidak ada (PR-074).

**AI Changes:**

* Jalur degradasi resmi feed.

**Database Changes:**

* Tidak ada.

**API Changes:**

* GET /api/v1/me/matches

**Security Considerations:**

* requireSelf; response tidak memuat alasan berbasis data sensitif secara eksplisit (penjelasan memakai istilah akomodasi lowongan, bukan kondisi user).

**Testing Checklist:**

* [ ] Unit Test (template)
* [ ] Integration Test (kedua mode)
* [ ] E2E Test (via PR-074)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (matikan AI di staging)

**Deliverables:**

* API feed matching final

**Out of Scope:**

* UI (PR-074).

**Rollback Strategy:**

RB-Std; flag paksa mode degradasi tersedia.

#### Acceptance Criteria

* [ ] Mode normal & degraded menghasilkan kontrak response identik (golden test).
* [ ] Gateway dimatikan → feed valid + template ("Cocok: remote, sesuai keterampilan X").
* [ ] Penjelasan tidak pernah menyebut disabilitas user (review + test string).
* [ ] Pagination/limit stabil.
* [ ] p95 endpoint < 800 ms (cache hangat).

#### Dependencies

* PR-072

#### Risks

* Konvergensi 3 jalur (profiles/gateway/jobs) — PR paling kritis. Mitigasi: semua dependensi selesai + spike pgvector sudah lewat (PR-070).


### PR-074 - Matching Feed FE + Degradasi UX

#### Objective

**Beranda seeker: kartu skor+alasan, banner degradasi, refresh berkuota.**

Bisnis: US-07 — pengalaman "platform ini mengerti saya". Teknis: kartu (skor teks+visual, alasan, ikon akomodasi berlabel), banner `role="status"` saat degraded, tombol refresh + sisa kuota, fokus/scroll restore.

#### Scope

* Halaman feed utama (beranda seeker)
* Integrasi filter browse

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature job-feed/matches.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (kartu + jest-axe)
* [ ] Integration Test (N/A)
* [ ] E2E Test (normal + degraded mock)
* [ ] Accessibility Test (axe + NVDA kartu)
* [ ] Manual Verification (kombinasi preferensi a11y)

**Deliverables:**

* Beranda matching produksi-ready

**Out of Scope:**

* Mobile feed (PR-093).

**Rollback Strategy:**

RB-Std; fallback beranda = browse (PR-058) via flag.

#### Acceptance Criteria

* [ ] Kartu satu kesatuan bagi SR (skor+alasan+akomodasi terbaca utuh).
* [ ] Skor bukan warna-saja (angka + label tekstual).
* [ ] Degraded → banner informatif; fitur tetap lengkap; tanpa UI rusak.
* [ ] Feed→detail→kembali: fokus & scroll pulih.
* [ ] Refresh menampilkan sisa kuota; habis → tombol nonaktif dengan alasan.

#### Dependencies

* PR-073
* PR-059

#### Risks

* Informasi kartu padat → overload (autisme). Mitigasi: mode teks sederhana menyembunyikan elemen sekunder.


## Exit Criteria

Phase 11 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 6 PR (PR-069..PR-074) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 12 - Applications](phase-12-applications.md)
