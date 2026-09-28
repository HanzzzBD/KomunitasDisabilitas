---
phase: 10
name: "AI CV Builder"
prs: PR-065..PR-068 (4 PR)
sprint: "6-7"
depends_on: [2, 6, 9]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 10 - AI CV Builder

## Overview

AI CV Builder: sesi chat resume-able, endpoint SSE dengan prompt interviewer, ekstraksi terstruktur ke draft CV, dan UI chat aksesibel dengan fallback UX.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 06 - AI Gateway](phase-06-ai-gateway.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 09 - Resume Builder & PDF](phase-09-resume-builder-pdf.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-065** - Penyimpanan sesi chat
* **PR-066** - Endpoint chat CV hidup
* **PR-067** - Ekstraksi AI → draft CV
* **PR-068** - AI CV Builder end-to-end

## Pull Requests

### PR-065 - Chat Sessions BE

#### Objective

**Migrasi ai_chat_sessions + CRUD sesi (resume-able).**

Bisnis: percakapan CV tidak hilang saat koneksi 3G putus (T7). Teknis: state sesi di server (transcript jsonb, status), retensi 30d pasca-finalize (hook PR-024) (G7 migrasi inkremental).

#### Scope

* Migrasi tabel + create/get/append
* Guard: transkrip tanpa field sensitif (tipe)

#### Technical Notes

**Backend Changes:**

* `modules/ai/sessions`.

**Frontend Changes:**

* Tidak ada.

**AI Changes:**

* Kontrak sesi untuk chat.

**Database Changes:**

* Tabel `ai_chat_sessions` (id, user_id, transcript jsonb, status, finalized_at).

**API Changes:**

* GET /api/v1/ai/cv-chat/:session

**Security Considerations:**

* requireSelf; retensi 30 hari (PDP minimisasi); transkrip tidak memuat data sensitif profil.

**Testing Checklist:**

* [x] Unit Test (append) — `ai-chat-sessions.test.ts` (13 test: validasi giliran, pemetaan penolakan, guard tipe, kebijakan retensi, HTTP)
* [x] Integration Test (authz + konkurensi) — `ai-chat-sessions-db.test.ts` (15 test, PostgreSQL nyata)
* [ ] E2E Test (via PR-068)
* [ ] Accessibility Test (N/A)
* [x] Manual Verification (psql) — `\d ai_chat_sessions`: unique parsial `satu_aktif`, dua CHECK, FK cascade (2026-09-28)

**Deliverables:**

* Penyimpanan sesi chat

**Out of Scope:**

* Streaming (PR-066).

**Rollback Strategy:**

Migrasi additive; RB-Std.

#### Acceptance Criteria

* [x] Sesi dibuat/dibaca/di-append dengan authz benar. — `ai-chat-sessions-db.test.ts` + HTTP `GET /ai/cv-chat/:session`: sesi milik orang lain = 404 identik dengan yang tidak ada
* [x] Retensi terdaftar di PR-024 (test selector). — `createAiChatSessionPolicies` dirakit di worker retensi; selektor `finalized`/`abandoned` diuji lewat `createRetentionService` di DB nyata
* [x] Transkrip berisi giliran berurutan konsisten (append aman konkuren). — 20 append serentak → `seq` 1..20 tanpa ganda/lubang; 8 "mulai" serentak → satu sesi
* [x] Migrasi down teruji. — `down.sql` lalu `migration.sql` dijalankan di DB nyata di dalam transaksi yang di-rollback
* [x] Ukuran transkrip dibatasi (guard). — `AI_CHAT_LIMITS` (2.000 karakter/giliran, 120 giliran, 256 KiB) ditegakkan di `WHERE` append yang sama; tahan permintaan serentak

#### Dependencies

* PR-044
* PR-019

#### Risks

* Transkrip membengkak. Mitigasi: limit ukuran + retensi.


### PR-066 - CV-Chat SSE Endpoint + Prompt Interviewer

#### Objective

**POST /ai/cv-chat streaming + cv-interviewer.v1.**

Bisnis: USP AI CV Builder — wawancara terpandu suportif satu pertanyaan per giliran (PRD FR-3.1). Teknis: SSE via gateway (kuota 30/hari), prompt v1 (persona, larangan nasihat medis), append transkrip.

#### Scope

* Endpoint SSE + prompt + wiring kuota
* Resume by session (last-event-id)

#### Technical Notes

**Backend Changes:**

* `modules/ai/chat` + prompt registry entry.

**Frontend Changes:**

* Tidak ada (PR-068).

**AI Changes:**

* Prompt `cv-interviewer.v1` (system + few-shot) terdokumentasi.

**Database Changes:**

* Tidak ada.

**API Changes:**

* POST /api/v1/ai/cv-chat (SSE)

**Security Considerations:**

* Injection guard aktif (input user = data); kuota; auth header di handshake.

**Testing Checklist:**

* [x] Unit Test (prompt builder) — `ai-cv-chat.test.ts` (23 test: template, usage stream, `AiClient.stream`, SSE sesudah-tutup, registry aliran)
* [x] Integration Test (SSE + kuota + resume) — `ai-cv-chat-http.test.ts` (9 test, server + soket nyata, mesin kuota asli)
* [ ] E2E Test (via PR-068)
* [ ] Accessibility Test (N/A)
* [x] Manual Verification (percakapan nyata ~~staging~~ lokal, provider nyata) — dua giliran Gemini/Groq nyata lewat service lengkap (2026-09-28); menemukan model bawaan pensiun & latensi Gemini (U-26/U-27)

**Deliverables:**

* Endpoint chat CV hidup

**Out of Scope:**

* Ekstraksi (PR-067); UI (PR-068).

**Rollback Strategy:**

RB-Std; chat dapat dimatikan via flag → UI fallback form.

#### Acceptance Criteria

* [x] Streaming end-to-end (mock provider). — `ai-cv-chat-http.test.ts`: `giliran → token… → giliran → selesai`, id berurutan, transkrip tersimpan
* [x] Kuota habis → DegradedError event terstruktur di stream. — event `error` `KUOTA_AI_HABIS` + `degraded: true` + `retryAfterSeconds`; provider tidak disentuh
* [x] Putus → resume tanpa kehilangan giliran (test). — koneksi diputus setelah token pertama; `GET /ai/cv-chat/:session/stream` + `Last-Event-Id` menerima sisa tanpa duplikat/lubang, giliran asisten tersimpan utuh
* [x] Prompt berversi tercatat di ai_usage. — `promptVersion: "cv-interviewer.v1"` + token dari usage provider (Gemini `usageMetadata`, Groq `include_usage`)
* [x] Fallback Groq menghasilkan format giliran sama (normalisasi). — `cvInterviewerV1.rapikan`; test HTTP fallback + test unit dua gaya keluaran

#### Dependencies

* PR-065
* PR-045

#### Risks

* Kualitas pertanyaan LLM bervariasi. Mitigasi: few-shot + iterasi versi prompt (registry).


### PR-067 - Finalize + Ekstraksi Resume (Worker)

#### Objective

**ai:extract-resume: transcript → draft resumeSchema + retry-with-feedback.**

Bisnis: hasil chat menjadi CV nyata yang direview manusia (AI mengusulkan, manusia memutuskan). Teknis: prompt `cv-extractor.v1` JSON mode → zod; gagal parse retry 1× dengan pesan perbaikan; gagal 2× → arahkan jalur manual + transkrip terlampir (T5).

#### Scope

* Endpoint finalize (202) + processor
* Draft `created_via: ai_chat`

#### Technical Notes

**Backend Changes:**

* Processor + prompt extractor.

**Frontend Changes:**

* Tidak ada.

**AI Changes:**

* Prompt `cv-extractor.v1` + kebijakan retry.

**Database Changes:**

* Tidak ada.

**API Changes:**

* POST /api/v1/ai/cv-chat/:session/finalize

**Security Considerations:**

* Output tervalidasi zod sebelum simpan (tidak pernah data invalid); transkrip retensi.

**Testing Checklist:**

* [ ] Unit Test (parser retry)
* [ ] Integration Test (job penuh, output rusak disimulasikan)
* [ ] E2E Test (via PR-068)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (finalize sesi nyata staging)

**Deliverables:**

* Ekstraksi AI → draft CV

**Out of Scope:**

* UI review (editor PR-061 dipakai).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Output valid → draft resume tersimpan utk review.
* [ ] Invalid 1× → retry dengan feedback; 2× → fallback manual (tidak buntu).
* [ ] Tidak ada draft gagal-schema tersimpan (test).
* [ ] Notifikasi "draft CV siap direview".
* [ ] Idempoten per sesi (finalize ganda aman).

#### Dependencies

* PR-066
* PR-060

#### Risks

* Ekstraksi kehilangan detail penting. Mitigasi: user selalu review/edit sebelum pakai (human-in-the-loop).


### PR-068 - Chat FE — useAiStream + Fallback UX

#### Objective

**UI chat aksesibel: streaming aria-live, kuota, resume, switch manual.**

Bisnis: pembeda produk dirasakan SEMUA ragam pengguna (chat usable dengan screen reader). Teknis: hook `useAiStream` (fetch-SSE + auth header), token → `aria-live="polite"`, indikator "AI mengetik" tekstual, banner kuota, resume sesi, pilihan "chat AI / form biasa", auto-switch saat degraded.

#### Scope

* Halaman chat + integrasi finalize → editor
* Semua state (streaming/putus/degraded/limit)

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature resume-builder/chat.

**AI Changes:**

* Tidak ada (konsumsi).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Output AI dirender sebagai teks murni (tanpa markdown-HTML injection).

**Testing Checklist:**

* [ ] Unit Test (useAiStream state machine)
* [ ] Integration Test (N/A)
* [ ] E2E Test (happy + degraded + putus-sambung)
* [ ] Accessibility Test (axe + NVDA aria-live manual)
* [ ] Manual Verification (3G throttling)

**Deliverables:**

* AI CV Builder end-to-end

**Out of Scope:**

* Voice input (Fase 3 produk).

**Rollback Strategy:**

RB-Std; flag mematikan chat → hanya form manual.

#### Acceptance Criteria

* [ ] Chat→finalize→draft→edit→simpan end-to-end.
* [ ] Kuota habis → beralih form manual dengan pesan jujur (bukan error).
* [ ] Putus koneksi → resume tanpa kehilangan percakapan.
* [ ] Giliran AI terbaca otomatis oleh NVDA tanpa mencuri fokus input (manual).
* [ ] Sisa kuota tampil & akurat.

#### Dependencies

* PR-067
* PR-061

#### Risks

* aria-live + streaming = pengalaman SR berisik. Mitigasi: umumkan per kalimat/segmen, bukan per token (buffer).


## Exit Criteria

Phase 10 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 4 PR (PR-065..PR-068) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 11 - Matching Engine](phase-11-matching-engine.md)
