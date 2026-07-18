# ADR-005 — Gemini sebagai AI Provider Utama dan Groq sebagai Fallback

Status: Accepted

Tanggal: 2026-07-15

## Context

Fitur AI Incasif (AI CV Builder, AI Job Matching re-rank, ekstraksi profil, simplify-text; Fase 2: STT caption, deskripsi gambar) membutuhkan LLM, model embedding, dan STT dengan biaya ~Rp0 pada fase validasi (PRD §9). Melatih model sendiri ditolak pada discovery PRD (tim tanpa ML engineer, tanpa dana GPU).

Constraint: hanya free tier resmi yang diizinkan untuk produksi; kredit proxy development (freemodel.dev) DILARANG dipakai produksi; privasi — data disabilitas tidak dikirim ke provider AI (SDD §7.3).

Alternatif yang dipertimbangkan:
1. **Self-host model open-source** — bebas biaya API tetapi butuh server GPU (~$100–300/bulan) dan keahlian MLOps; bertentangan dengan constraint biaya.
2. **Satu provider tunggal** — paling sederhana, tetapi free tier dapat berubah sepihak (Risiko T2 SDD §20) tanpa jalur cadangan.
3. **Gemini utama + Groq fallback** — dua free tier resmi, kemampuan saling melengkapi.

## Decision

Provider AI utama Incasif adalah **Google Gemini** (Gemini Flash untuk chat/ekstraksi JSON/re-rank/multimodal; text-embedding 768-dim untuk matching). **Groq** adalah fallback (Llama untuk chat saat Gemini gagal/429; Whisper untuk STT Fase 2). Seluruh akses provider WAJIB melalui AI Gateway (ADR-012); tidak ada modul yang memanggil provider secara langsung. Setiap fitur AI WAJIB memiliki jalur degradasi non-AI yang berfungsi penuh.

## Consequences

### Positif

* Biaya AI Rp0 pada fase validasi; jalur berbayar Gemini Flash murah (< $50/bulan pada 5.000 pengguna).
* Dua provider independen → perubahan kebijakan satu free tier tidak melumpuhkan produk.
* Kemampuan multimodal Gemini menutup kebutuhan Fase 2 (deskripsi gambar) tanpa provider baru.

### Negatif

* Ketergantungan pada kebijakan free tier pihak ketiga yang dapat berubah sepihak.
* Kualitas fallback (Llama via Groq) berbeda dari Gemini → konsistensi output antar provider tidak identik.
* Kuota harian membatasi pemakaian per pengguna (mis. cv-chat 30 pesan/hari).

### Mitigasi

* Degradasi anggun kelas satu: kuota habis → form manual, feed rule-based + penjelasan template (SDD §7.2) — produk tetap berfungsi penuh tanpa AI.
* Prompt berversi + validasi output zod menormalkan perbedaan antar provider (SDD §7.3).
* Pengajuan kredit cloud startup (Google for Startups/AWS Activate) sejak bulan 1 sebagai jalur pendanaan kuota.

## Referensi

PRD §9; SDD §7, §20 (T2). Terkait: ADR-004, ADR-012.
