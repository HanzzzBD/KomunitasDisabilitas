# ADR-012 — AI Gateway sebagai Satu-satunya Jalur Akses AI Provider

Status: Accepted

Tanggal: 2026-07-15

## Context

Banyak modul Incasif memakai AI (Resumes, Matching, AI, SignBridge; Fase 2: interview simulator, deskripsi gambar). Tanpa titik kontrol tunggal, penegakan kuota free tier, fallback provider, caching, dan larangan pengiriman data sensitif akan tersebar dan tidak konsisten — pelanggaran satu titik cukup untuk menghabiskan kuota global atau membocorkan data.

Constraint: biaya AI ~Rp0 (kuota ketat); privacy-by-design (data disabilitas tidak boleh mencapai provider); graceful degradation wajib untuk seluruh fitur AI.

Alternatif yang dipertimbangkan:
1. **Setiap modul memanggil SDK provider langsung** — sederhana per modul, tetapi kuota/fallback/privasi tidak dapat ditegakkan terpusat.
2. **API gateway eksternal (LiteLLM/proxy self-host)** — kemampuan setara, tetapi menambah container dan hop jaringan di VPS yang sama.
3. **Modul internal `core/ai` sebagai gateway in-process.**

## Decision

Seluruh akses ke provider AI WAJIB melalui **AI Gateway** — modul internal `core/ai` dengan antarmuka `chat()`, `chatStream()`, `embed()`, `stt()`, `rerank()`. Gateway menegakkan, dalam urutan: (1) kuota per pengguna dan global (Redis), (2) cache semantik, (3) routing provider Gemini → Groq, (4) circuit breaker per provider, (5) pencatatan `ai_usage`. Aturan lint boundaries melarang modul lain mengimpor SDK/HTTP provider AI. Kuota habis menghasilkan `DegradedError` yang ditangani setiap fitur dengan jalur non-AI. Prompt adalah template berversi yang hidup di dalam gateway; data pribadi spesifik tidak pernah dimasukkan ke prompt.

## Consequences

### Positif

* Kuota, biaya, fallback, dan kebijakan privasi ditegakkan di satu tempat yang dapat diaudit.
* Penambahan provider (termasuk SignBridge v2) adalah perubahan lokal di gateway — modul fitur tidak berubah.
* `ai_usage` + versi prompt memberikan jejak lengkap untuk debugging kualitas dan proyeksi biaya.

### Negatif

* Gateway menjadi titik kritis — bug di dalamnya berdampak ke semua fitur AI.
* Abstraksi umum berisiko menyembunyikan kemampuan spesifik provider yang berguna.
* Cache semantik menambah kompleksitas invalidasi.

### Mitigasi

* Gateway diuji paling ketat (unit + contract test per provider); circuit breaker mencegah kegagalan provider menjalar.
* Antarmuka gateway boleh menambah opsi spesifik-provider secara eksplisit (typed options), bukan lewat bypass.
* Kunci cache deterministik dari hash input + versi prompt → perubahan prompt otomatis meng-invalidasi cache.

## Referensi

SDD §5.1, §7.1, §7.3; PRD §9. Terkait: ADR-004, ADR-005, ADR-010.
