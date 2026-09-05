---
phase: 6
name: "AI Gateway"
prs: PR-041..PR-046 (6 PR)
sprint: "3-4"
depends_on: [1]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 06 - AI Gateway

## Overview

AI Gateway sebagai satu-satunya jalur akses provider AI: adapter Gemini+Groq, router+circuit breaker, kuota+cost tracking, prompt registry+cache+injection guard, SSE streaming, kontrak degradasi.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 01 - Foundation](phase-01-foundation.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-041** - Gateway single-provider fungsional
* **PR-042** - Failover multi-provider teruji
* **PR-043** - Kuota + cost tracking hidup
* **PR-044** - Prompt management + cache + guard
* **PR-045** - Infrastruktur streaming AI
* **PR-046** - Kontrak degradasi baku

## Pull Requests

### PR-041 - Gateway Core + Adapter Gemini

#### Objective

**Interface provider + Gemini (chat, JSON mode, embedding 768).**

Bisnis: fondasi semua fitur AI dengan biaya ~Rp0 (ADR-005). Teknis: `core/ai` kerangka — tipe request/response per capability, adapter Gemini, error mapping; JSON mode tervalidasi zod di boundary (ADR-012).

#### Scope

* Interface `AiProvider` per capability (chat/json/embed)
* Adapter Gemini + error taxonomy (rate/serverside/safety)
* Contract test terhadap mock server berskema riil

#### Technical Notes

**Backend Changes:**

* `core/ai/{gateway.ts,providers/gemini.ts,types.ts}`.

**Frontend Changes:**

* Tidak ada.

**AI Changes:**

* Adapter Gemini Flash (chat, JSON) + text-embedding-004 (768-dim).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* API key via env; error provider tidak membocorkan payload ke klien; tipe input prompt tidak menerima tipe sensitif (compile-time, difinalkan PR-044).

**Testing Checklist:**

* [ ] Unit Test (mapping, tipe)
* [ ] Integration Test (contract vs mock server)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (panggilan nyata di staging dengan key uji)

**Deliverables:**

* Gateway single-provider fungsional

**Out of Scope:**

* Fallback/breaker (PR-042); kuota (PR-043).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] `chat()` dan `embed()` fungsional terhadap mock Gemini.
* [ ] JSON mode: output invalid → error terstruktur (bukan crash).
* [ ] Error taxonomy memetakan 429/5xx/safety berbeda.
* [ ] Timeout per panggilan dikonfigurasi.
* [ ] Tidak ada modul lain mengimpor SDK Gemini (lint PR-002).

#### Dependencies

* PR-011
* PR-015

#### Risks

* Skema API Gemini berubah. Mitigasi: contract test + adapter terisolasi.


### PR-042 - Adapter Groq + Router + Circuit Breaker

#### Objective

**Fallback Gemini→Groq + breaker per provider.**

Bisnis: satu free tier tumbang ≠ produk tumbang (T2). Teknis: router kebijakan per capability (chat fallback ke Llama-Groq; embed TANPA fallback by design); breaker buka 60 dtk setelah 5 error (SDD §7.1).

#### Scope

* Adapter Groq (chat)
* Router + breaker + half-open probe

#### Technical Notes

**Backend Changes:**

* `core/ai/{providers/groq.ts,router.ts,breaker.ts}`.

**Frontend Changes:**

* Tidak ada.

**AI Changes:**

* Kebijakan fallback per capability terdokumentasi.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Key Groq via env; payload identik dua provider (tidak ada data ekstra ke fallback).

**Testing Checklist:**

* [ ] Unit Test (router, breaker state machine)
* [ ] Integration Test (mock dua provider)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (simulasi 429 di staging)

**Deliverables:**

* Failover multi-provider teruji

**Out of Scope:**

* STT Whisper (Fase 2 produk).

**Rollback Strategy:**

RB-Std; router dapat dipaksa single-provider via config.

#### Acceptance Criteria

* [ ] Gemini 429/5xx → Groq dipakai otomatis (contract test).
* [ ] Breaker terbuka setelah 5 error; half-open setelah 60 dtk (test clock).
* [ ] Embed saat Gemini down → error terkontrol untuk retry job (bukan fallback keliru).
* [ ] Provider terpakai tercatat per panggilan (untuk ai_usage).
* [ ] Konsistensi output antar provider dinormalkan (format respons sama).

#### Dependencies

* PR-041

#### Risks

* Kualitas Llama ≠ Gemini. Mitigasi: prompt berversi + validasi output zod (PR-044).


### PR-043 - Quota Engine + ai_usage + GET /ai/quota

#### Objective

**Kuota per-user/global + pencatatan biaya/token.**

Bisnis: biaya AI tetap ~Rp0 dan adil antar pengguna (PRD §9). Teknis: counter Redis config-driven (cv-chat 30/hari, finalize 5, simplify 20, rerank 3 refresh; global = free tier − buffer 20%); `DegradedError` + `Retry-After`; pencatatan `ai_usage` async (SDD §7.1).

#### Scope

* Quota engine + konfigurasi
* Recorder ai_usage (provider, tokens, fitur, versi prompt)
* Endpoint kuota user

#### Technical Notes

**Backend Changes:**

* `core/ai/quota.ts` + modul `ai` (router kuota); `core/ai/client.ts` (`AiClient`) + recorder/repository `ai_usage` + processor worker (PR-043b).

**Frontend Changes:**

* Tidak ada (banner kuota di PR fitur).

**AI Changes:**

* Cost tracking per fitur/provider.

**Database Changes:**

* Kolom `ai_usage.prompt_version` (nullable, migrasi 10, PR-043b) + antrean `ai-usage-record` (SDD §16).

  > **Koreksi 2026-09-02 (PR-043b).** Baris ini semula berbunyi "Tidak ada
  > (ai_usage dari PR-011)" dan bertentangan dengan AC-nya sendiri: tabel
  > PR-011 tidak punya kolom versi prompt, sedangkan AC menuntut "ai_usage
  > tercatat per panggilan (fitur, provider, token, **versi prompt**)". Yang
  > dibetulkan adalah dokumennya, bukan AC-nya.

**API Changes:**

* GET /api/v1/ai/quota

**Security Considerations:**

* Rate Limiting AI = kontrol biaya & abuse; kuota per-user mencegah satu akun menghabiskan global.

**Testing Checklist:**

* [ ] Unit Test (counter, reset)
* [ ] Integration Test (habis → degraded; pencatatan)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (GET /ai/quota)

**Deliverables:**

* Kuota + cost tracking hidup

**Out of Scope:**

* Alert kuota >90% (PR-103).

**Rollback Strategy:**

RB-Std; kuota dapat di-nolkan (matikan AI) via config darurat.

#### Acceptance Criteria

* [ ] Kuota habis → DegradedError (bukan 500) + Retry-After.
* [ ] Counter reset harian (timezone WIB) teruji.
* [ ] ai_usage tercatat per panggilan (fitur, provider, token, versi prompt).
* [ ] Global cap menghentikan sebelum melampaui free tier (buffer 20%).
* [ ] Semua angka kuota dari config (bukan hardcode).

#### Dependencies

* PR-041

#### Risks

* Estimasi free tier meleset. Mitigasi: buffer 20% + alert + degradasi anggun.


### PR-044 - Prompt Registry + Cache Semantik + Injection Guard

#### Objective

**Template prompt berversi + cache Redis + pertahanan injeksi.**

Bisnis: kualitas AI dapat dilacak & biaya ditekan (cache). Teknis: registry `prompts/<nama>.vN.ts` (system+few-shot+skema output zod); cache key = hash(input+versi prompt); delimiter data tak tepercaya + sanitasi output; tipe input menolak field sensitif (SDD §7.3).

#### Scope

* Registry + konvensi versi
* Cache layer + invalidasi by versi
* Guard injeksi input/output

#### Technical Notes

**Backend Changes:**

* `core/ai/{prompts/,cache.ts,guard.ts}`.

**Frontend Changes:**

* Tidak ada.

**AI Changes:**

* Manajemen prompt formal; versi tercatat di ai_usage.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Prompt injection: konten user/lowongan dibungkus delimiter "data, bukan instruksi"; output whitelist (tanpa HTML); Sensitive Data ditolak type-level di input prompt.

**Testing Checklist:**

* [ ] Unit Test (cache key, guard)
* [ ] Integration Test (suite injeksi vs mock)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (review template awal)

**Deliverables:**

* Prompt management + cache + guard

**Out of Scope:**

* Prompt fitur (di PR fitur: 066/067/072/087).

**Rollback Strategy:**

RB-Std; versi prompt lama dapat diaktifkan kembali via config.

#### Acceptance Criteria

* [ ] Naikkan versi prompt → cache lama tidak terpakai (test). *(PR-044b)*
* [ ] Instruksi jahat dalam data ("abaikan aturan…") dinetralkan (suite injeksi). *(PR-044a)*
* [ ] Output HTML/script disanitasi (test). *(PR-044a)*
* [ ] Tipe input prompt menolak **`disabilityTypes`** (compile-time). *(PR-044a)*
* [ ] Cache hit tercatat (metrik hemat kuota). *(PR-044b)*

  > **Pemecahan 2026-09-02 (PR-044a/PR-044b).** PR-044 dipecah karena estimasinya
  > ~1300 LOC (pagu CLAUDE.md §9 = 500) **dan** karena ketiga subsistemnya punya
  > sifat risiko yang berbeda: guard adalah permukaan keamanan (sanitizer pertama
  > di repo), cache adalah keputusan kuota/privasi yang belum diputuskan. Jahitan:
  > **044a = registry prompt + guard injeksi** (tidak menyentuh Redis, kuota,
  > `ai_usage`, maupun `client.ts`); **044b = cache**. Preseden: PR-043a/043b.
  >
  > **Amandemen AC-4 (2026-09-02, PR-044a).** Baris ini semula berbunyi "Tipe
  > input prompt menolak `SensitiveProfile`". Yang dipersempit adalah AC-nya,
  > bukan penegakannya. `SensitiveProfile`
  > (`packages/schemas/src/profiles.ts`) MEMBUNDEL `disabilityTypes` **dan**
  > `accommodationNeeds`, sedangkan SDD §7.3 secara eksplisit MENGIZINKAN
  > kebutuhan akomodasi fungsional masuk prompt bila fitur memerlukannya dan
  > pengguna sudah consent. Menolak seluruh tipe berarti memblokir jalur yang
  > SDD sahkan — dan PR fitur berikutnya (PR-066/072) terpaksa MELEMAHKAN guard,
  > persis saat guard biasanya dilemahkan dengan buruk. Yang ditegakkan
  > `TanpaDisabilitas` karena itu adalah aturan privasi yang SEBENARNYA: kunci
  > `disabilityTypes`/`disability_types`, rekursif menembus objek dan larik.
  > Efek praktisnya `SensitiveProfile` utuh TETAP DITOLAK (ia membawa kunci itu),
  > sedangkan `{ accommodationNeeds }` diterima. Dijaga
  > `apps/api/__tests__/prompt-registry.test.ts` (berikut kontrol positifnya) dan
  > `apps/api/__tests__/prompt-sensitif-jangkauan.test.ts`.

#### Dependencies

* PR-043

#### Risks

* Guard injeksi tidak pernah 100%. Mitigasi: output selalu tervalidasi zod + tidak pernah dieksekusi/dirender HTML.


### PR-045 - SSE Streaming (chatStream)

#### Objective

**Streaming token SSE + heartbeat + resume by session.**

Bisnis: chat CV terasa hidup di jaringan 3G (T7). Teknis: helper SSE di core/http (heartbeat 15 dtk, event id), `chatStream()` di gateway, kontrak resume by session id.

#### Scope

* SSE helper + chatStream
* Kontrak resume (last-event-id)

#### Technical Notes

**Backend Changes:**

* `core/http/sse.ts`, `core/ai/stream.ts`.

**Frontend Changes:**

* Tidak ada (hook di PR-068).

**AI Changes:**

* Streaming capability gateway.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (dipakai PR-066).

**Security Considerations:**

* Auth di handshake SSE (header, bukan query token); heartbeat mencegah idle-timeout proxy.

**Testing Checklist:**

* [ ] Unit Test (encoder event)
* [ ] Integration Test (putus-sambung, heartbeat)
* [ ] E2E Test (via PR-068)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (network throttling 3G)

**Deliverables:**

* Infrastruktur streaming AI

**Out of Scope:**

* Endpoint cv-chat (PR-066).

**Rollback Strategy:**

RB-Std; fitur chat dapat fallback polling via flag.

#### Acceptance Criteria

* [ ] Stream putus → resume tanpa token duplikat/hilang (test).
* [ ] Heartbeat 15 dtk terkirim saat idle.
* [ ] Backpressure: klien lambat tidak menumpuk memori tak terbatas.
* [ ] Error mid-stream dikirim sebagai event error terstruktur.
* [ ] Kompatibel dengan `proxy_buffering off` (dicatat untuk PR-098).

#### Dependencies

* PR-042

#### Risks

* Proxy buffering menelan stream. Mitigasi: konfigurasi nginx eksplisit + smoke test staging.


### PR-046 - Kontrak Degradasi + Lint No-Direct-Provider

#### Objective

**DegradedError lintas fitur + fixture larangan bypass gateway.**

Bisnis: graceful degradation adalah janji produk (semua fitur AI punya jalur non-AI). Teknis: tipe `DegradedError` + helper `withDegradation(fallback)`; fixture lint no-direct-provider final (ADR-012).

#### Scope

* Kontrak error + helper
* Dokumentasi pola degradasi per fitur (tabel)

#### Technical Notes

**Backend Changes:**

* `core/ai/degraded.ts` + fixtures.

**Frontend Changes:**

* Konvensi `meta.degraded` di response (dipakai FE fitur).

**AI Changes:**

* Pola fallback baku.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Konvensi field `meta.degraded: boolean` pada response fitur AI.

**Security Considerations:**

* Degradasi tidak boleh menurunkan kontrol akses (fallback melewati guard yang sama).

**Testing Checklist:**

* [ ] Unit Test (helper)
* [ ] Integration Test (N/A)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (review tabel degradasi)

**Deliverables:**

* Kontrak degradasi baku

**Out of Scope:**

* Implementasi degradasi per fitur (di PR fitur).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] `withDegradation` mengembalikan fallback saat DegradedError (test).
* [x] Error non-degradasi tetap dilempar (tidak tertelan).
* [x] Fixture import langsung provider → lint merah.
* [x] Tabel pola degradasi per fitur terdokumentasi (CV→form, feed→template, simplify→sembunyikan).
* [x] `meta.degraded` konsisten di kontrak zod.

#### Tabel Pola Degradasi per Fitur (AC-4)

Kontraknya satu untuk semua fitur: jalur AI melempar `DegradedError`,
`withDegradation` menukarnya dengan jalur non-AI, dan response menandainya
`meta.degraded: true`. Yang berbeda hanya ISI jalur non-AI-nya. PR-046
menetapkan tabel ini; PR fitur di kolom terakhir yang mengisinya dengan kode.

| Fitur | Jalur AI | Fallback saat degradasi | Perilaku ke pengguna | PR pelaksana |
|---|---|---|---|---|
| CV Chat | `chatStream()` (`core/ai/stream.ts`) | CV builder berbasis formulir — tanpa AI | `meta.degraded: true`; banner "Bantuan AI sedang tidak tersedia, lanjutkan mengisi manual"; isian yang sudah ada TIDAK hilang | PR-066 (BE), PR-068 (FE) |
| Feed Lowongan | Re-rank AI (`rerank`, `embed`) | Urutan dasar dari pgvector/FTS — tanpa re-rank | `meta.degraded: true`; feed TETAP tampil, tanpa label "direkomendasikan AI" | PR-072 (BE), PR-073 (endpoint), PR-074 (FE) |
| Sederhanakan Teks | `chatJson()` (`simplify_text`) | Tidak ada versi sederhana — teks asli tetap tampil | `meta.degraded: true`; tombol "Sederhanakan" dinonaktifkan + `aria-disabled` beserta alasannya | PR-087 |

Tiga aturan yang berlaku untuk SEMUA baris, dan tidak boleh ditawar per fitur:

1. **Degradasi bukan kegagalan.** Statusnya tetap 2xx dan `data` tetap sah;
   `DegradedError` hanya sampai ke pengguna sebagai error bila fallback-nya
   memang tidak ada.
2. **Degradasi tidak menurunkan kontrol akses.** Jalur fallback berjalan di
   controller dan guard RBAC yang sama persis; `withDegradation` murni dan
   tidak menyentuh middleware.
3. **Degradasi terlihat.** Diam-diam menyajikan hasil non-AI seolah hasil AI
   melanggar janji produk; `meta.degraded` ada supaya FE bisa mengatakannya.

#### Dependencies

* PR-042
* PR-002

#### Risks

* Fitur lupa menangani degraded. Mitigasi: tipe return gateway memaksa penanganan (union type).


## Exit Criteria

Phase 06 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 6 PR (PR-041..PR-046) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 07 - Notifications](phase-07-notifications.md)
