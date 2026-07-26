# Product Requirements Document (PRD)

# Nawasena — Masa Depan Karier Tanpa Batas

| | |
|---|---|
| **Versi** | 1.2 |
| **Tanggal** | 24 Juli 2026 |
| **Status** | Untuk review tim |
| **Nama produk** | **Nawasena** |
| **Tagline** | **Masa Depan Karier Tanpa Batas** |

---

## 1. Executive Summary

Nawasena adalah platform karier inklusif berbasis teknologi yang membantu penyandang disabilitas menemukan peluang kerja yang setara, aksesibel, dan sesuai potensi mereka. Melalui web dan mobile, Nawasena menghubungkan talenta dengan perusahaan inklusif melalui **AI matching** yang mempertimbangkan keterampilan, pengalaman, preferensi, dan kebutuhan akomodasi; asisten karier AI; serta transparansi aksesibilitas perusahaan.

Pencari kerja menggunakan platform **100% gratis**. Pendapatan berasal dari sisi B2B (perusahaan): lowongan premium, akses kandidat, dan success fee — diaktifkan bertahap mulai Fase 2.

- **North Star Metric:** jumlah penempatan kerja (pengguna diterima bekerja melalui platform).
- **Target tahun 1:** validasi dengan < 5.000 pengguna terdaftar di 1–2 kota/komunitas.
- **Timeline MVP:** 3–4 bulan.
- **Tim:** 2–5 orang; stack React + React Native, backend Express.js + TypeScript dengan ORM Prisma di atas PostgreSQL 18 + pgvector di VPS, AI via API LLM free-tier resmi (Gemini/Groq) dengan kuota per pengguna.
- **Standar aksesibilitas:** WCAG 2.2 Level AA.

---

## 2. Problem Statement

Penyandang disabilitas di Indonesia menghadapi hambatan berlapis dalam mencari kerja:

1. **Portal kerja tidak aksesibel.** Portal umum (JobStreet, LinkedIn, dll.) tidak kompatibel dengan pembaca layar, tidak menyediakan bahasa isyarat, dan memakai formulir kompleks — proses melamar saja sudah menjadi penghalang.
2. **Ketidakjelasan dan diskriminasi.** Lowongan tidak menyatakan apakah menerima penyandang disabilitas. Pelamar sering ditolak setelah mengungkap kondisinya — membuang waktu, biaya, dan kesehatan mental.
3. **Kesulitan CV dan wawancara.** Banyak pencari kerja disabilitas kesulitan menyusun CV/surat lamaran yang kompetitif dan tidak percaya diri saat wawancara karena hambatan komunikasi.
4. **Gap keterampilan.** Keterampilan sering tidak sesuai kebutuhan pasar, dan tidak ada panduan pelatihan yang cocok dengan kondisi masing-masing.

Konteks regulasi: UU No. 8/2016 mewajibkan kuota tenaga kerja disabilitas 2% (instansi pemerintah/BUMN) dan 1% (swasta), namun kepatuhan rendah — salah satunya karena perusahaan kesulitan menemukan kandidat. Ada **gap dua arah** yang bisa dijembatani platform ini.

---

## 3. Product Vision

**Positioning:** Nawasena adalah platform digital yang menghubungkan penyandang disabilitas dengan peluang kerja yang inklusif. Dengan semangat harapan baru dan kesetaraan, Nawasena membantu setiap individu menunjukkan kemampuan terbaiknya serta membangun masa depan karier yang lebih cerah.

**Kepribadian brand:** ramah, mendukung, memberdayakan, berorientasi masa depan, dan tidak mengasihani. Copy produk mengutamakan kesempatan, potensi, kesetaraan, aksesibilitas, pertumbuhan, masa depan, dan pemberdayaan.

> **"Setiap penyandang disabilitas di Indonesia dapat menemukan, melamar, dan mendapatkan pekerjaan yang layak tanpa hambatan akses dan tanpa diskriminasi."**

**Nilai inti / USP:**
1. **AI matching disabilitas-pekerjaan** — mencocokkan berdasarkan kemampuan, jenis disabilitas, dan akomodasi yang dibutuhkan vs. yang tersedia; bukan sekadar kata kunci.
2. **Pengalaman 100% aksesibel** — WCAG 2.2 AA end-to-end: pembaca layar, mode low vision, konten BISINDO, teks sederhana, input alternatif.
3. **Asisten karier AI** — CV builder percakapan terpandu dan simulasi wawancara dengan umpan balik.
4. **Transparansi inklusivitas perusahaan** — informasi fasilitas aksesibel, akomodasi, dan (Fase 2) review dari pekerja disabilitas.
5. **Ruang komunitas aman** — ruang diskusi berdasarkan topik atau kota untuk berbagi informasi karier, pengalaman, dan dukungan antarpengguna, dengan moderasi aktif.

**Prinsip desain:** *Nothing about us without us* — melibatkan komunitas disabilitas (Gerkatin, Pertuni, HWDI, dll.) dalam desain, pengujian, dan konten sejak hari pertama.

---

## 4. User Persona

### Persona 1 — Rina, 24, Tuli (pengguna BISINDO)
- Lulusan SMK desain grafis, tinggal di Jakarta. Bahasa pertama BISINDO; teks Indonesia panjang kadang melelahkan.
- **Tujuan:** kerja desain di perusahaan yang mau berkomunikasi via teks/isyarat.
- **Frustrasi:** lowongan mensyaratkan "komunikasi lisan baik" tanpa alasan jelas; wawancara telepon mustahil.
- **Kebutuhan produk:** konten video BISINDO, semua interaksi bisa via teks, caption otomatis, info akomodasi komunikasi di tiap lowongan.

### Persona 2 — Bayu, 29, Netra (pengguna screen reader)
- Sarjana ilmu komunikasi, mahir TalkBack/NVDA. Tinggal di Yogyakarta.
- **Tujuan:** pekerjaan admin/customer service/penulisan konten.
- **Frustrasi:** portal kerja tidak bisa dinavigasi screen reader; poster lowongan berupa gambar; CAPTCHA visual.
- **Kebutuhan produk:** kompatibilitas screen reader penuh, deskripsi gambar oleh AI, navigasi keyboard, mode kontras tinggi.

### Persona 3 — Sari, 31, Daksa (pengguna kursi roda, keterbatasan motorik tangan)
- Berpengalaman 5 tahun sebagai staf keuangan, resign karena kantor lama tidak aksesibel.
- **Tujuan:** kerja remote/hybrid atau kantor dengan akses kursi roda.
- **Frustrasi:** tidak ada info aksesibilitas gedung; form lamaran butuh banyak gerakan presisi.
- **Kebutuhan produk:** filter "remote/aksesibel kursi roda", target sentuh besar, navigasi keyboard penuh, minim drag/swipe.

### Persona 4 — Dimas, 22, Autisme
- Lulusan D3 informatika, sangat teliti, kuat dalam pola dan data.
- **Tujuan:** pekerjaan QA/data entry/programming dengan ekspektasi jelas.
- **Frustrasi:** wawancara penuh pertanyaan ambigu; UI ramai membuat overload; deskripsi kerja tidak eksplisit.
- **Kebutuhan produk:** mode teks sederhana, UI konsisten dan tenang (opsi kurangi animasi), panduan wawancara eksplisit dengan contoh, simulasi wawancara dengan umpan balik lembut.

### Persona sekunder — Admin/Kurator (internal) dan Employer (Fase 2)
- **Admin:** memasukkan & memverifikasi lowongan, memverifikasi profil inklusivitas perusahaan, moderasi, melihat analytics.
- **Employer (Fase 2):** memasang lowongan dengan formulir akomodasi terstruktur, melihat pelamar ke lowongannya sendiri.

---

## 5. User Stories

### Onboarding & profil aksesibilitas
- **US-01:** Sebagai pencari kerja, saya bisa mendaftar dengan Google Sign-In atau nomor HP + OTP, agar tidak perlu mengingat password.
- **US-02:** Sebagai pengguna baru, saya bisa memilih ragam disabilitas dan menyusun **profil aksesibilitas custom** (kombinasi bebas: screen reader, kontras tinggi, teks sederhana, kurangi animasi, target sentuh besar, preferensi BISINDO) agar UI menyesuaikan otomatis — penting untuk disabilitas ganda.
- **US-03:** Sebagai pengguna, saya bisa mengubah preferensi aksesibilitas kapan saja dari satu tempat yang mudah dijangkau.

### Profil & CV (AI)
- **US-04:** Sebagai pencari kerja, saya bisa membuat CV melalui **percakapan terpandu dengan AI** (chat teks; suara di Fase 3) yang menanyakan pengalaman, keterampilan, dan pendidikan saya satu per satu.
- **US-05:** Sebagai pencari kerja, saya bisa mengunduh CV hasil AI dalam format PDF yang rapi dan ATS-friendly.
- **US-06:** Sebagai pencari kerja, saya bisa mencatat kebutuhan akomodasi kerja saya (mis. juru bahasa isyarat, screen reader, meja adjustable, instruksi tertulis) di profil.

### Pencarian & matching
- **US-07:** Sebagai pencari kerja, saya melihat feed lowongan terurut berdasarkan **skor kecocokan AI** beserta alasan singkat ("cocok karena: remote, komunikasi via teks, sesuai skill desain").
- **US-08:** Sebagai pencari kerja, saya bisa memfilter lowongan berdasarkan jenis pekerjaan, lokasi, remote/onsite, dan akomodasi yang tersedia.
- **US-09:** Sebagai pencari kerja, saya bisa melihat **profil inklusivitas perusahaan**: akomodasi yang disediakan, fasilitas fisik, cara komunikasi yang didukung.

### Lamaran & tracking
- **US-10:** Sebagai pencari kerja, saya bisa melamar dengan satu ketukan menggunakan CV yang sudah dibuat.
- **US-11:** Sebagai pencari kerja, saya bisa **mengontrol per lamaran** apakah informasi disabilitas dan kebutuhan akomodasi saya diungkap ke perusahaan (disclosure control).
- **US-12:** Sebagai pencari kerja, saya bisa memantau status lamaran (terkirim → dilihat → diproses → wawancara → diterima/ditolak) dengan notifikasi yang aksesibel (visual, bukan hanya suara).

### Admin
- **US-13:** Sebagai admin, saya bisa menambah/mengedit lowongan hasil kurasi kerja sama, lengkap dengan field akomodasi terstruktur.
- **US-14:** Sebagai admin, saya bisa memverifikasi dan memberi label tingkat inklusivitas perusahaan.
- **US-15:** Sebagai admin, saya bisa melihat dashboard: pendaftaran, lamaran, penempatan, penggunaan fitur AI.

### Fase 2+
- **US-16:** Sebagai pencari kerja, saya bisa berlatih wawancara dengan AI (teks & suara + caption) dan mendapat umpan balik yang membangun.
- **US-17:** Sebagai employer, saya bisa memasang lowongan dan melihat pelamar ke lowongan saya.
- **US-18:** Sebagai pencari kerja Tuli, saya bisa menonton panduan utama aplikasi dalam video BISINDO.
- **US-19:** Sebagai pencari kerja, saya bisa membaca/menulis review pengalaman kerja di perusahaan (moderated).
- **US-20:** Sebagai pencari kerja, saya bisa bergabung ke ruang komunitas berdasarkan topik atau kota, membaca diskusi, lalu membuat post atau balasan agar dapat bertukar informasi dan dukungan karier.
- **US-21:** Sebagai pengguna, saya bisa melaporkan post atau balasan yang melanggar aturan komunitas; sebagai admin, saya bisa meninjau laporan serta menyembunyikan atau memulihkan konten dengan alasan yang tercatat.

---

## 6. Functional Requirements

### FR-1 Autentikasi & akun
- FR-1.1 Google Sign-In (OAuth 2.0).
- FR-1.2 Login nomor HP + OTP via WhatsApp (lebih murah & umum daripada SMS; fallback SMS).
- FR-1.3 Manajemen sesi JWT (access + refresh token).
- FR-1.4 Hapus akun mandiri: seluruh data pribadi terhapus/dianonimkan ≤ 30 hari (hak UU PDP).

### FR-2 Profil aksesibilitas (fitur pembeda utama)
- FR-2.1 Wizard onboarding menanyakan ragam disabilitas (multi-select: Tuli, Netra, Daksa, Autisme, lainnya) — opsional dan dapat dilewati.
- FR-2.2 Preferensi UI tersimpan per akun & tersinkron antar perangkat: ukuran teks, kontras tinggi, kurangi animasi, mode teks sederhana, preferensi BISINDO, target sentuh besar.
- FR-2.3 Seluruh aplikasi mengonsumsi preferensi ini secara global (context/theme), bukan per halaman.

### FR-3 Profil & CV builder AI
- FR-3.1 Chat terpandu AI menghasilkan draft profil terstruktur (pengalaman, pendidikan, keterampilan, ringkasan).
- FR-3.2 Pengguna dapat mengedit semua field hasil AI sebelum disimpan (AI mengusulkan, manusia memutuskan).
- FR-3.3 Ekspor CV ke PDF aksesibel (tagged PDF) dengan template rapi.
- FR-3.4 Field kebutuhan akomodasi terstruktur (taksonomi standar + teks bebas).
- FR-3.5 Kuota AI: pembuatan/regenerasi CV dibatasi (mis. 5×/hari/pengguna) untuk menjaga free tier.

### FR-4 Lowongan & matching
- FR-4.1 CRUD lowongan oleh admin dengan field terstruktur: jabatan, deskripsi, persyaratan, lokasi, remote/hybrid/onsite, rentang gaji, **akomodasi tersedia** (taksonomi), ragam disabilitas yang secara eksplisit disambut.
- FR-4.2 Skor kecocokan: kombinasi **rule-based filter** (hard constraints: lokasi, remote, akomodasi wajib) + **semantic matching** (embedding profil vs lowongan) + re-rank LLM untuk top-N dengan penjelasan singkat.
- FR-4.3 Pencarian teks + filter faceted; hasil tetap berfungsi penuh tanpa AI (graceful degradation saat kuota habis).
- FR-4.4 Halaman detail lowongan menampilkan profil inklusivitas perusahaan.

### FR-5 Lamaran & tracking
- FR-5.1 One-tap apply dengan CV terpilih.
- FR-5.2 Disclosure control per lamaran (ungkap/tidak ungkap data disabilitas & akomodasi).
- FR-5.3 Status pipeline lamaran + riwayat; pembaruan status oleh admin (MVP) atau employer (Fase 2).
- FR-5.4 Notifikasi in-app + push (FCM) + email; semuanya berbasis visual/teks.
- FR-5.5 Konfirmasi penempatan: saat status "diterima", pengguna diminta konfirmasi → data North Star Metric.

### FR-6 Panel admin
- FR-6.1 Manajemen lowongan, perusahaan, dan label inklusivitas (terverifikasi/klaim sendiri).
- FR-6.2 Moderasi konten & pengguna.
- FR-6.3 Dashboard metrik (lihat §15).

### FR-7 Fase 2
- FR-7.1 Simulasi wawancara AI: sesi tanya-jawab per kategori pekerjaan, mode teks & suara (STT + caption), umpan balik terstruktur bernada suportif, mode "panduan eksplisit" untuk pengguna autisme.
- FR-7.2 Portal employer self-service + alur verifikasi perusahaan.
- FR-7.3 Review perusahaan oleh pekerja/alumni disabilitas (moderated, anonim opsional).
- FR-7.4 Video BISINDO untuk panduan aplikasi dan konten kunci.
- FR-7.5 Komunitas (post-MVP, Phase 19): ruang komunitas dikelola admin berdasarkan topik atau kota; pengguna terautentikasi dapat bergabung, membaca, membuat post teks, dan membalas.
- FR-7.6 Moderasi komunitas: pengguna dapat melaporkan konten; admin dapat menyembunyikan, memulihkan, atau menghapus konten sesuai pedoman. Semua tindakan moderasi tercatat di audit log dan pemilik konten menerima notifikasi.
- FR-7.7 Privasi komunitas: data disabilitas, kebutuhan akomodasi, lamaran, dan CV tidak pernah ditampilkan atau dipakai untuk menentukan keanggotaan komunitas. Saat akun dihapus, identitas penulis pada konten komunitas dianonimkan sesuai kebijakan PDP.

### FR-8 Fase 3
- FR-8.1 Avatar penerjemah teks→BISINDO (evaluasi teknologi; alternatif: perpustakaan video isyarat manusia).
- FR-8.2 Rekomendasi pelatihan + integrasi partner BLK/lembaga pelatihan.
- FR-8.3 Agregasi lowongan otomatis dari portal lain + klasifikasi AI ramah-disabilitas.
- FR-8.4 Voice interface penuh (navigasi & pengisian form via suara).

---

## 7. Non-Functional Requirements

| Kategori | Requirement |
|---|---|
| **Aksesibilitas** | WCAG 2.2 Level AA untuk web & mobile; teruji dengan NVDA, TalkBack, VoiceOver; navigasi keyboard 100%; kontras ≥ 4.5:1; target sentuh ≥ 44×44px; tidak ada konten hanya-audio tanpa alternatif teks; tidak ada CAPTCHA visual-only. Audit oleh penguji penyandang disabilitas tiap rilis besar. |
| **Kinerja** | Halaman utama interaktif < 3 detik pada koneksi 3G; respons API p95 < 800 ms; fitur AI boleh async dengan indikator progres aksesibel. |
| **Ketersediaan** | Target 99% (MVP, single VPS); backup otomatis harian; RPO ≤ 24 jam, RTO ≤ 4 jam. |
| **Skalabilitas** | Desain untuk 5.000 pengguna terdaftar / ~500 DAU tahun pertama; monolith modular yang bisa dipecah nanti; API stateless agar mudah scale horizontal. |
| **Keamanan** | Lihat §12. TLS 1.2+; enkripsi at rest untuk data spesifik; mitigasi OWASP Top 10; rate limiting. |
| **Privasi** | Kepatuhan UU PDP No. 27/2022 (data disabilitas = data pribadi spesifik): consent eksplisit granular, tujuan terbatas, hak akses/hapus. |
| **Kompatibilitas** | Android 8+, iOS 14+, browser evergreen; tetap berfungsi wajar di perangkat murah. |
| **Bahasa** | Indonesia (i18n-ready); semua output AI dalam Bahasa Indonesia sederhana. |
| **Biaya** | Infrastruktur + AI ≤ ~Rp300rb/bulan pada fase validasi (VPS + free tier AI). |

---

## 8. System Architecture

### Gambaran umum (MVP): Monolith modular di satu VPS

```
┌────────────────────────────────────────────────────────────┐
│  KLIEN                                                     │
│  • Web: React (Vite) — SPA aksesibel, komponen headless    │
│  • Mobile: React Native (Expo) — Android & iOS             │
│  • Shared: design system aksesibel + API client (TS)       │
└──────────────────────────┬─────────────────────────────────┘
                           │ HTTPS (REST + SSE untuk AI stream)
┌──────────────────────────▼─────────────────────────────────┐
│  VPS (Docker Compose, Ubuntu LTS)                          │
│  ┌──────────────┐  ┌──────────────────────────────────┐    │
│  │ Nginx/Caddy  │→ │ API — Express.js + TypeScript    │    │
│  │ TLS, gzip,   │  │  Modules: auth, profiles, jobs,  │    │
│  │ rate limit   │  │  applications, matching, ai,     │    │
│  └──────────────┘  │  notifications, admin            │    │
│                    └───────┬──────────────┬───────────┘    │
│  ┌──────────────┐  ┌───────▼────────┐  ┌──▼─────────────┐  │
│  │ Worker (Bull │  │ PostgreSQL 18  │  │ Redis          │  │
│  │ MQ): AI jobs,│  │ + pgvector     │  │ cache, queue,  │  │
│  │ notif, PDF   │  │ (embeddings)   │  │ rate limit     │  │
│  └──────────────┘  └────────────────┘  └────────────────┘  │
└────────────────────────────────────────────────────────────┘
          │                    │                   │
   ┌──────▼──────┐   ┌─────────▼────────┐  ┌───────▼───────┐
   │ AI Gateway  │   │ Object storage   │  │ Layanan luar  │
   │ Gemini API  │   │ S3-compatible    │  │ FCM (push),   │
   │ (free tier) │   │ (CV PDF, video   │  │ WA OTP (Fonnte│
   │ + Groq      │   │ BISINDO) — mis.  │  │ /Twilio),     │
   │ (fallback)  │   │ Cloudflare R2    │  │ email (Resend)│
   └─────────────┘   └──────────────────┘  └───────────────┘
```

**Keputusan arsitektur kunci:**
1. **Monolith modular, bukan microservices** — tim 2–5 orang, < 5.000 pengguna; microservices adalah overhead tanpa manfaat pada skala ini. Batas modul yang bersih (konvensi modul Express + aturan lint boundaries, lihat SDD §5.1) memudahkan pemecahan nanti.
2. **PostgreSQL 18 + pgvector, diakses via ORM Prisma** — satu database untuk data relasional dan embedding vektor (matching), tanpa vector DB terpisah.
3. **Antrian kerja (BullMQ + Redis)** — semua panggilan AI berjalan async via worker: melindungi API dari latensi LLM, memungkinkan retry, dan menegakkan kuota free tier.
4. **SSE untuk streaming AI** — chat CV builder terasa hidup tanpa kompleksitas WebSocket.
5. **Semua state di luar proses API** (Postgres/Redis) — API stateless, siap direplikasi bila tumbuh.
6. **Docker Compose di satu VPS** (4 vCPU/8 GB, ~Rp150–250rb/bln) + backup otomatis ke object storage. Jalur upgrade: pisahkan DB ke managed PostgreSQL saat > ~20rb pengguna.

### Frontend
- **Web:** React 18 + Vite + TypeScript; komponen headless (Radix UI / React Aria) — perilaku ARIA sudah teruji; Tailwind CSS dengan design tokens yang merespons profil aksesibilitas (ukuran teks, kontras, motion).
- **Mobile:** React Native + Expo; `accessibilityLabel`/`accessibilityRole` wajib di setiap komponen interaktif; pengujian TalkBack & VoiceOver masuk definition-of-done.
- **Shared packages (monorepo Turborepo):** `@app/api-client`, `@app/tokens`, `@app/a11y` (hook profil aksesibilitas).

---

## 9. AI Architecture

### Prinsip
1. **AI adalah asisten, bukan penentu** — semua output AI dapat diedit pengguna; matching selalu punya fallback rule-based.
2. **Biaya ~Rp0 pada fase validasi** — free tier resmi, kuota per pengguna, degradasi anggun.
3. **Privasi** — data disabilitas tidak pernah dikirim ke API AI kecuali diperlukan fitur & disetujui; tidak ada training pada data pengguna.

### Komponen

| Fitur | Model/Layanan | Mode | Fase |
|---|---|---|---|
| CV builder (chat terpandu) | Gemini Flash (free tier) | API, streaming SSE | 1 |
| Ekstraksi profil terstruktur | Gemini Flash, JSON mode | API, async worker | 1 |
| Embedding profil & lowongan | Gemini text-embedding (free tier) | API, batch | 1 |
| Re-rank + penjelasan kecocokan | Gemini Flash | API, cached | 1 |
| Simulasi wawancara (teks/suara) | Gemini Flash + Whisper via Groq (gratis) untuk STT | API | 2 |
| Deskripsi gambar (poster lowongan) | Gemini Flash (multimodal) | API | 2 |
| Caption otomatis video | Whisper via Groq | Batch | 2 |
| Avatar BISINDO | Riset — model custom / kemitraan; alternatif pragmatis: perpustakaan klip video isyarat manusia | TBD | 3 |

### Pipeline matching (Fase 1)

```
Profil user ──► embedding ─┐
                           ├─► pgvector cosine similarity (top-50)
Lowongan ────► embedding ──┘            │
                                        ▼
                     Hard filters (rule-based):
                     lokasi, remote, akomodasi wajib ada
                                        │
                                        ▼
                     LLM re-rank top-20 + penjelasan
                     1 kalimat per lowongan
                     (cache 24 jam per pasangan user×job)
                                        ▼
                     Feed berperingkat + skor + alasan
```

### Manajemen kuota & degradasi
- **AI Gateway module** memusatkan semua panggilan LLM: routing provider (Gemini → Groq fallback), retry, circuit breaker, penghitung kuota harian global & per pengguna (Redis).
- Saat kuota habis: CV builder beralih ke form terstruktur biasa; feed beralih ke rule-based + pencarian teks; pengguna diberi tahu dengan jujur ("Fitur AI kembali besok").
- **Estimasi biaya:** Fase validasi: Rp0 (free tier Gemini cukup untuk ratusan pengguna aktif dengan cache & kuota). Saat melebihi: Gemini Flash berbayar sangat murah — estimasi < $50/bulan pada 5.000 pengguna. Ajukan kredit **Google for Startups / AWS Activate / Microsoft for Startups** sejak bulan 1.
- **Catatan penting:** kredit freemodel.dev ($10/5 jam) **hanya untuk development** (Claude Code sebagai coding assistant) — bukan untuk backend produksi (tidak stabil, berisiko melanggar ketentuan layanan).

---

## 10. Database Design

### Skema inti (PostgreSQL 18 + pgvector)

```sql
users (
  id uuid PK, phone text UNIQUE NULL, google_id text UNIQUE NULL,
  email text NULL, full_name text, role enum('seeker','admin','employer'),
  created_at, last_active_at, deleted_at NULL  -- soft delete utk UU PDP
)

accessibility_profiles (          -- preferensi UI, BUKAN data medis
  user_id uuid PK FK, text_scale int, high_contrast bool,
  reduce_motion bool, simple_language bool, prefers_sign_language bool,
  large_touch_targets bool, screen_reader_hint bool, updated_at
)

seeker_profiles (
  user_id uuid PK FK, headline text, summary text,
  city text, province text, open_to_remote bool,
  disability_types text[] NULL,        -- DATA SPESIFIK → kolom terenkripsi
  accommodation_needs jsonb NULL,      -- DATA SPESIFIK → kolom terenkripsi
  disclosure_default enum('never','ask_each_time','always'),
  profile_embedding vector(768),
  consent_sensitive_at timestamptz NULL   -- bukti consent eksplisit
)

experiences (id PK, user_id FK, title, company, start_date, end_date, description)
educations  (id PK, user_id FK, institution, degree, field, year)
skills      (id PK, user_id FK, name, level)

resumes (
  id uuid PK, user_id FK, title, content jsonb,   -- CV terstruktur
  pdf_url text, created_via enum('ai_chat','manual'), created_at
)

companies (
  id uuid PK, name, description, website, city,
  inclusivity_status enum('unverified','self_claimed','verified'),
  accommodations_available jsonb,      -- taksonomi akomodasi
  verified_by uuid FK NULL, verified_at NULL
)

jobs (
  id uuid PK, company_id FK, title, description text,
  requirements text, employment_type enum, work_mode enum('onsite','hybrid','remote'),
  city, province, salary_min, salary_max, salary_visible bool,
  accommodations jsonb,                -- akomodasi utk posisi ini
  welcomed_disability_types text[],    -- opsional, eksplisit menyambut
  source enum('admin_curated','employer','aggregated'),
  status enum('draft','published','closed'), job_embedding vector(768),
  created_by FK, published_at, expires_at
)

applications (
  id uuid PK, user_id FK, job_id FK, resume_id FK,
  disclose_disability bool,            -- disclosure control per lamaran
  status enum('submitted','viewed','in_review','interview',
              'offered','hired','rejected','withdrawn'),
  status_history jsonb, applied_at, updated_at,
  hired_confirmed_at NULL              -- North Star Metric
)

match_scores (      -- cache hasil matching
  user_id FK, job_id FK, score numeric, explanation text,
  computed_at, PRIMARY KEY(user_id, job_id)
)

ai_usage (          -- penegakan kuota + audit
  id PK, user_id FK, feature enum, provider, tokens_in, tokens_out, created_at
)

notifications (id PK, user_id FK, type, payload jsonb, read_at NULL, created_at)
audit_logs (id PK, actor_id, action, entity, entity_id, meta jsonb, created_at)

-- Fase 2:
company_reviews (id PK, company_id FK, user_id FK, rating, accessibility_rating,
                 body, is_anonymous bool, moderation_status, created_at)
interview_sessions (id PK, user_id FK, job_category, transcript jsonb,
                    feedback jsonb, mode enum('text','voice'), created_at)
```

**Catatan desain:**
- `disability_types` & `accommodation_needs` dienkripsi kolom (pgcrypto/enkripsi level aplikasi, kunci di env) — terpisah dari preferensi UI (`accessibility_profiles`) yang tidak sensitif.
- Indeks: pgvector HNSW pada kedua kolom embedding; GIN pada jsonb akomodasi; full-text search pada jobs.
- Soft delete + purging terjadwal untuk memenuhi hak penghapusan UU PDP.

---

## 11. API Design

REST + JSON, versioning `/api/v1`, JWT Bearer, rate limit per IP & per user. SSE untuk streaming AI.

```
AUTH
POST   /auth/google                     # exchange Google token
POST   /auth/otp/request                # kirim OTP (WA, fallback SMS)
POST   /auth/otp/verify                 # verifikasi → JWT pair
POST   /auth/refresh
DELETE /auth/account                    # hapus akun (UU PDP)

PROFIL
GET/PUT /me
GET/PUT /me/accessibility               # profil aksesibilitas custom
GET/PUT /me/profile                     # seeker profile (consent utk field sensitif)
CRUD    /me/experiences | /me/educations | /me/skills
GET/POST /me/resumes ; GET /me/resumes/:id/pdf

AI (semua lewat AI Gateway; 429 + fallback saat kuota habis)
POST /ai/cv-chat                        # SSE stream, sesi chat CV builder
POST /ai/cv-chat/:session/finalize      # ekstrak → draft resume utk direview user
GET  /ai/quota                          # sisa kuota harian user
POST /ai/interview/session              # Fase 2
POST /ai/describe-image                 # Fase 2

JOBS & MATCHING
GET  /jobs?query&city&work_mode&accommodations&page
GET  /jobs/:id                          # termasuk profil inklusivitas company
GET  /me/matches                        # feed berperingkat + skor + alasan
GET  /companies/:id

LAMARAN
POST /jobs/:id/apply                    # {resume_id, disclose_disability}
GET  /me/applications
POST /me/applications/:id/withdraw
POST /me/applications/:id/confirm-hired # North Star

ADMIN (role: admin)
CRUD /admin/jobs | /admin/companies
POST /admin/companies/:id/verify
GET  /admin/metrics
PUT  /admin/applications/:id/status

NOTIFIKASI
GET  /me/notifications ; POST /me/notifications/:id/read
POST /me/devices                        # registrasi token FCM
```

**Konvensi:** error envelope konsisten `{code, message, hint}` dengan `message` dalam bahasa Indonesia sederhana (dibaca screen reader & ditampilkan langsung); pagination cursor-based; idempotency key untuk `apply`.

---

## 12. Security & Privacy

1. **Klasifikasi data.** Data disabilitas & akomodasi = **data pribadi spesifik** (UU PDP 27/2022): consent eksplisit terpisah saat onboarding (bukan bundled), enkripsi at rest (kolom) + in transit (TLS 1.2+), akses dibatasi role & dicatat di `audit_logs`.
2. **Disclosure control.** Default: data disabilitas TIDAK dibagikan ke perusahaan; pengguna memutuskan per lamaran. Admin melihatnya hanya untuk keperluan dukungan, dengan audit.
3. **RBAC.** `seeker` (data sendiri), `admin` (kurasi + moderasi, least privilege), `employer` (Fase 2: hanya pelamar ke lowongannya, dan hanya field yang di-disclose).
4. **AppSec.** Mitigasi OWASP Top 10: parameterized queries (Prisma), validasi input (zod), CSRF protection, rate limiting (Redis), security headers, dependency scanning, secrets di env — tidak pernah di repo.
5. **AI safety.** Guard prompt injection pada input pengguna ke LLM; output AI disanitasi; tidak ada data spesifik dalam prompt kecuali fitur membutuhkan + consent; log AI tanpa PII.
6. **Operasional.** Backup DB harian terenkripsi ke object storage (retensi 30 hari); prosedur insiden & notifikasi kebocoran ≤ 72 jam (kewajiban UU PDP); akses SSH VPS key-only + fail2ban.
7. **Hak subjek data.** Ekspor data mandiri (JSON), hapus akun mandiri, halaman privasi berbahasa sederhana + versi BISINDO (Fase 2).

---

## 13. User Flow

### Flow utama pencari kerja

```
Buka app ──► Daftar (Google / HP+OTP)
   │
   ▼
Onboarding aksesibilitas (dapat dilewati)
   • "Bagaimana kami bisa menyesuaikan aplikasi untukmu?"
   • Pilih ragam disabilitas (opsional, consent eksplisit)
   • Atur preferensi: teks besar? kontras tinggi? teks sederhana?
     kurangi animasi? BISINDO?
   • UI langsung berubah sesuai pilihan (preview live)
   │
   ▼
Buat profil & CV
   • Pilihan: "Ngobrol dengan asisten AI" ATAU "Isi form biasa"
   • AI bertanya satu per satu → draft CV → user review & edit → simpan
   • Catat kebutuhan akomodasi (opsional)
   │
   ▼
Feed lowongan (matching)
   • Kartu lowongan: jabatan, perusahaan + badge inklusivitas,
     skor kecocokan + alasan 1 kalimat, ikon akomodasi
   • Filter: lokasi, remote, jenis kerja, akomodasi
   │
   ▼
Detail lowongan ──► Lamar (1 tap)
   • Pilih CV
   • "Bagikan info disabilitas & kebutuhan akomodasimu ke
     perusahaan ini?" [Ya / Tidak] ← disclosure control
   │
   ▼
Tracking status (submitted → … → hired)
   • Notifikasi visual di tiap perubahan status
   • Saat "diterima" → konfirmasi penempatan 🎉
```

### Flow admin (MVP)
```
Login admin → Tambah perusahaan → verifikasi inklusivitas →
Tambah lowongan (field akomodasi terstruktur) → publish →
Kelola lamaran masuk (update status a.n. perusahaan partner) →
Pantau dashboard metrik
```

---

## 14. MVP Scope & Roadmap

### Fase 1 — MVP (Bulan 1–4)
**Tujuan: validasi bahwa pencari kerja disabilitas bisa menemukan & melamar kerja tanpa hambatan.**
- Autentikasi Google + HP/OTP (WA)
- Onboarding + profil aksesibilitas custom (sinkron web/mobile)
- AI CV builder (chat teks) + editor + PDF aksesibel + fallback form
- Lowongan kurasi admin + taksonomi akomodasi
- Matching (embedding + rule + penjelasan LLM) dengan graceful degradation
- One-tap apply + disclosure control + tracking status + notifikasi
- Panel admin + dashboard metrik dasar
- WCAG 2.2 AA: screen reader, low vision, teks sederhana, keyboard, target sentuh
- **Gate rilis:** audit aksesibilitas oleh ≥ 5 penguji penyandang disabilitas (lintas ragam)

**Milestone:**
- M1 — desain + design system aksesibel + skema DB
- M2 — auth, profil, admin, lowongan
- M3 — AI CV builder + matching
- M4 — apply/tracking, audit aksesibilitas, pilot dengan 1–2 komunitas & 5–10 perusahaan partner

### Fase 2 (Bulan 5–8)
- Simulasi wawancara AI (teks & suara + caption; mode panduan eksplisit)
- Portal employer self-service + verifikasi + **monetisasi awal** (job slot premium/akses kandidat)
- Review inklusivitas perusahaan (moderated)
- Video BISINDO untuk panduan utama; AI deskripsi gambar
- Perluasan kota & komunitas

### Fase 3 (Bulan 9–12+)
- Avatar/penerjemah BISINDO (build vs partner — keputusan riset)
- Rekomendasi pelatihan + integrasi BLK/lembaga pelatihan
- Agregasi lowongan otomatis + klasifikasi AI
- Voice interface penuh untuk pengguna Netra
- Kemitraan formal Kemnaker (interop dengan ekosistem Kerjabilitas)

### Phase 19 - Komunitas (post-MVP, setelah v1.0.0 stabil)
- Ruang komunitas berdasarkan topik atau kota, dibuat dan dikelola admin
- Keanggotaan, post teks, balasan satu tingkat, serta pencarian/browse ringan
- Laporan konten, antrean moderasi, alasan tindakan, audit log, dan notifikasi hasil moderasi
- Gate peluncuran: pedoman komunitas, SOP eskalasi, serta uji aksesibilitas oleh pengguna disabilitas
- Di luar scope awal: pesan pribadi, unggahan media, live chat, user-created group, event, mentoring, dan webinar

---

## 15. KPI & Metrics

**North Star: jumlah penempatan kerja (hired) per kuartal.**

| Kategori | Metrik | Target Tahun 1 |
|---|---|---|
| **North Star** | Penempatan kerja terkonfirmasi | ≥ 50 |
| Adopsi | Pengguna terdaftar | 3.000–5.000 |
| Adopsi | Aktivasi (daftar → profil lengkap) | ≥ 60% |
| Adopsi | MAU / retensi bulan-1 | ≥ 35% / ≥ 40% |
| Engagement | Lamaran terkirim / bulan | ≥ 500 (bulan ke-6) |
| Engagement | Pengguna yang memakai AI CV builder | ≥ 50% pendaftar |
| Kualitas | Lamaran → wawancara rate | ≥ 10% |
| Aksesibilitas | Skor audit WCAG AA | 100% kriteria kritis lulus |
| Aksesibilitas | Task success rate penguji disabilitas (daftar→lamar) | ≥ 90% |
| Supply | Lowongan aktif terverifikasi | ≥ 150 |
| Kepuasan | CSAT / NPS pencari kerja | ≥ 4,3/5 |
| Biaya | Biaya infra+AI per bulan | ≤ Rp300rb (fase validasi) |

Instrumentasi: analytics self-hosted (PostHog CE / Umami) — hindari tracker pihak ketiga demi privasi; funnel: daftar → profil → lamar → wawancara → hired.

---

## 16. Kompetisi & Positioning

| Aspek | **Nawasena** | Kerjabilitas (Kemnaker) | Difalink | Portal umum (JobStreet dll.) |
|---|---|---|---|---|
| Fokus disabilitas | ✅ inti produk | ✅ | ✅ | ❌ |
| Aksesibilitas WCAG AA menyeluruh | ✅ gate rilis | Parsial | Parsial | Lemah |
| AI matching berbasis akomodasi | ✅ | ❌ | ❌ | ❌ (keyword) |
| AI CV builder & simulasi wawancara | ✅ | ❌ | ❌ | Terbatas, tidak aksesibel |
| Transparansi inklusivitas + review | ✅ | ❌ | Parsial | ❌ |
| Disclosure control per lamaran | ✅ | ❌ | ❌ | ❌ |
| Konten BISINDO | ✅ (Fase 2–3) | ❌ | ❌ | ❌ |

**Positioning:** bukan sekadar "portal kerja untuk difabel", melainkan **asisten karier aksesibel end-to-end**. Kompetitor menyelesaikan *distribusi lowongan*; Nawasena menyelesaikan *seluruh perjalanan*: kepercayaan diri (CV, wawancara), akses (WCAG, BISINDO), kecocokan (AI + akomodasi), dan keamanan psikologis (transparansi + disclosure control). Terhadap Kerjabilitas, posisinya **komplemen, bukan lawan** — jajaki interop/kemitraan dengan Kemnaker (sudah masuk daftar stakeholder).

---

## 17. Risks & Mitigations

| # | Risiko | Dampak | Kemungkinan | Mitigasi |
|---|---|---|---|---|
| R1 | **Cold start pasokan lowongan** — pengguna datang, lowongan sedikit → churn | Tinggi | Tinggi | Sebelum launch publik: amankan 5–10 perusahaan partner & ≥ 100 lowongan kurasi; launch per kota/komunitas, bukan nasional sekaligus |
| R2 | **Kuota AI free tier habis** saat pertumbuhan | Sedang | Tinggi | Kuota per user + cache agresif + fallback non-AI; ajukan kredit cloud startup sejak bulan 1 |
| R3 | **Klaim aksesibilitas tidak terbukti** — kegagalan di sini menghancurkan kepercayaan komunitas | Sangat tinggi | Sedang | Penguji penyandang disabilitas dibayar sejak sprint awal (bukan hanya pre-launch); WCAG masuk definition-of-done; audit tiap rilis |
| R4 | **Kebocoran data disabilitas** (data spesifik UU PDP) | Sangat tinggi | Rendah | Enkripsi kolom, RBAC + audit log, minimisasi data, disclosure default tertutup, rencana respons insiden |
| R5 | **Pendapatan B2B lambat** — perusahaan enggan bayar sebelum ada bukti | Tinggi | Sedang | Fase 1 fokus bukti penempatan; paket CSR/employer branding sebagai pintu masuk; jajaki hibah/CSR sebagai jembatan pendanaan |
| R6 | **Avatar BISINDO tidak feasible** dengan sumber daya saat ini | Sedang | Tinggi | Sudah di Fase 3 sebagai riset; alternatif pragmatis: video isyarat manusia untuk konten statis |
| R7 | **VPS tunggal = single point of failure** | Sedang | Sedang | Backup harian teruji-restore; skrip provisioning agar bisa rebuild < 4 jam; upgrade ke managed DB saat traksi |
| R8 | **Scope creep** (5 ragam disabilitas × banyak fitur AI, tim 2–5 orang) | Tinggi | Tinggi | Disiplin fase; MVP hanya cari-lamar; setiap penambahan fitur harus menggeser sesuatu keluar |
| R9 | **Timeline 3–4 bulan ketat** untuk kualitas WCAG AA penuh | Sedang | Sedang | Pakai komponen headless teruji (Radix/React Aria), bukan bangun dari nol; kurangi jumlah layar MVP |
| R10 | **Konfirmasi "hired" sulit dikumpulkan** → North Star tidak terukur | Sedang | Sedang | Insentif konfirmasi (badge/cerita sukses), verifikasi silang via admin & perusahaan partner |

**Celah ide yang teridentifikasi selama discovery (perlu keputusan lanjutan):**
1. Sisi employer sengaja ditunda — pastikan komitmen partner tertulis sebelum launch (mengatasi R1).
2. Belum ada anggaran konten BISINDO (juru bahasa isyarat profesional) — masukkan ke proposal hibah/CSR.
3. Mekanisme dukungan manusia (helpdesk aksesibel via chat/WA) belum didefinisikan — direkomendasikan ada sejak MVP karena AI saja tidak cukup untuk kelompok pengguna ini.
4. Verifikasi "perusahaan inklusif" perlu rubrik objektif agar label bermakna (bukan sekadar klaim).

---

## 18. Future Enhancements (pasca Fase 3)

- Komunitas & mentoring antar pengguna (alumni yang sudah bekerja membimbing pencari kerja)
- Job coach digital: pendampingan AI + manusia selama 90 hari pertama kerja (menurunkan turnover)
- Sertifikasi "Perusahaan Inklusif" berbayar dengan audit — lini pendapatan baru
- Marketplace freelance/gig untuk pekerjaan lepas
- Ekspansi bahasa (Inggris) & regional (Asia Tenggara)
- Model matching fine-tuned sendiri saat data interaksi cukup (> 100rb interaksi)
- API publik untuk integrasi dengan HRIS perusahaan & sistem pemerintah (SIAPkerja)

---

*Dokumen ini adalah living document. Review bersama tim dan komunitas disabilitas sebelum sprint 1.*
