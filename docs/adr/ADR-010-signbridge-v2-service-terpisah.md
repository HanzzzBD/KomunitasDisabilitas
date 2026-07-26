# ADR-010 — SignBridge v2 sebagai Service Terpisah

Status: Accepted

Tanggal: 2026-07-15

## Context

SignBridge Indonesia — penerjemah dua arah BISINDO/SIBI ↔ Bahasa Indonesia berbasis computer vision — adalah inovasi utama dalam visi produk (Deskripsi Nawasena) dan bagian dari fitur pembeda BISINDO Support. Pengenalan bahasa isyarat via computer vision membutuhkan model ML custom, dataset BISINDO, GPU, dan keahlian ML — di luar kapasitas tim MVP (2–5 orang, biaya AI ~Rp0, timeline 3–4 bulan).

Constraint: roadmap SignBridge WAJIB dipertahankan (Master Instruction); MVP tidak boleh terblokir oleh riset ML; monolith (ADR-001) berjalan di VPS tanpa GPU.

Alternatif yang dipertimbangkan:
1. **Implementasi computer vision penuh di MVP** — tidak feasible dengan sumber daya dan timeline yang ada.
2. **Hanya catatan visi tanpa desain** — inovasi utama tidak memiliki jalur teknis nyata.
3. **Bertahap: v1 feasible sekarang + v2 sebagai service terpisah dengan kontrak yang ditetapkan sejak awal.**

## Decision

SignBridge dibangun **bertahap**. **v1** (MVP–Fase 2, di dalam monolith sebagai modul `signbridge`): kamus video BISINDO oleh juru bahasa manusia (CRUD admin + pencarian publik, tabel `sign_videos`), STT real-time untuk caption (Whisper via Groq, Fase 2), dan TTS. **v2** (isyarat→teks dan teks→avatar via computer vision) adalah **service terpisah** — proses ML sendiri (Python, host GPU sendiri) di belakang AI Gateway (ADR-012) dengan kontrak API/WebRTC yang ditetapkan di SDD §7.4. Keputusan build vs partner untuk v2 diambil hanya setelah gerbang riset Fase 3 terpenuhi: dataset BISINDO tersedia/termitrakan, pendanaan GPU jelas, dan North Star awal tercapai. Tidak ada kode v2 yang ditulis sebelum gerbang tersebut.

## Consequences

### Positif

* MVP tidak menanggung risiko riset ML; pengguna Tuli tetap mendapat nilai nyata sejak v1 (kamus video, caption).
* Monolith tidak pernah perlu GPU; v2 hadir tanpa mengubah API monolith (hanya penambahan route provider di AI Gateway).
* Roadmap inovasi utama tetap hidup dengan gerbang keputusan yang jujur dan terukur.

### Negatif

* Diferensiasi "penerjemah isyarat AI" belum ada di MVP — klaim pemasaran harus disiplin pada apa yang nyata.
* Kualitas kamus video bergantung pada ketersediaan juru bahasa isyarat profesional (belum dianggarkan — celah PRD §17).
* Service terpisah kelak menambah kompleksitas operasional (host kedua, monitoring tambahan).

### Mitigasi

* Konten v1 dimasukkan ke proposal hibah/CSR untuk mendanai juru bahasa BISINDO (PRD §17).
* Kontrak v2 di SDD §7.4 dirancang sekarang → integrasi kelak adalah penambahan provider, bukan refactor.
* Gerbang riset dievaluasi per kuartal Fase 3; opsi kemitraan (bukan build) dievaluasi setara.

## Referensi

Deskripsi Nawasena; PRD §17 (R6); SDD §5.2, §7.4, §19. Terkait: ADR-001, ADR-012.
