# Katalog Event Analitik

> **Dibuat:** 2026-10-03 (PR-082) · **Sumber kebenaran kode:** `packages/schemas/src/analytics.ts`
> **Lampiran definisi KPI:** PRD §15 (mitigasi risiko PR-082 "event drift dari KPI")

Analytics Nawasena **self-hosted** (Umami, first-party di `/analitik`), **tanpa skrip pihak ketiga**
dan **tanpa PII**. Event baru = perubahan kontrak di `analytics.ts` + baris baru di katalog ini;
skema `.strict()` menolak apa pun di luar daftar.

## Kebijakan privasi (ditegakkan kode)

| Aturan | Penegak |
|---|---|
| Tidak ada nama, nomor, email, id pengguna/entitas | `data` per event hanya enum kecil `.strict()`; path id → `:id` |
| Tidak ada data disabilitas — termasuk pilihan pengungkapan saat melamar | event `lamar` tanpa `data` |
| Tidak ada query, hash, judul halaman, atau referrer | `normalkanPath` + `badanUmami` (tanpa `title`/`referrer`) |
| Identitas pengunjung = hash anonim Umami (IP + UA + salt harian, tanpa cookie) | konfigurasi Umami |
| Do Not Track / Global Privacy Control dihormati | `pelacakanDitolakPeramban()` |
| Opt-out pengguna (per perangkat) | Pengaturan → Akun & Data Saya → "Statistik pemakaian" |
| Gagal kirim tidak pernah mengganggu aplikasi | `track()` fire-and-forget; pengirim dimuat malas |

## Event

| Event | Dikirim saat | `data` | KPI PRD §15 |
|---|---|---|---|
| *(pageview)* | Setiap perpindahan halaman (kerangka `TataLetak`) | — (path ternormal) | MAU / retensi bulan-1 (pengunjung unik) |
| `daftar` | Verifikasi OTP / login Google yang MEMBUAT akun baru (`isNewUser`) | `metode`: `otp` \| `google` | Pengguna terdaftar; awal funnel |
| `profil_lengkap` | Simpan profil / tambah keahlian membuat profil berisi headline + kota/provinsi + ≥1 keahlian; **sekali per akun per perangkat** | — | Aktivasi (daftar → profil lengkap ≥ 60%) |
| `cv_dibuat` | CV dibuat dari profil, atau sesi AI CV builder selesai dengan CV (sekali per CV) | `via`: `profil` \| `ai` | Pengguna yang memakai AI CV builder (≥ 50%) |
| `lamar` | Lamaran BARU terkirim (bukan "sudah melamar") | — | Lamaran terkirim / bulan |
| `wawancara` | Pelamar melihat lamarannya berstatus wawancara atau lebih jauh; **sekali per lamaran per perangkat** | — | Lamaran → wawancara rate (≥ 10%) |
| `hired_confirmed` | Pelamar menekan "Saya diterima" | — | North Star (penempatan terkonfirmasi) |

Funnel Umami: `daftar → profil_lengkap → lamar → wawancara → hired_confirmed` (PRD §15).
Angka resmi North Star tetap dari server (`GET /admin/metrics`, PR-080); Umami adalah pelengkap
perilaku, bukan sumber hitungan resmi — event dari perangkat yang opt-out/DNT tidak tercatat.

## Konfigurasi

| Variabel (build web) | Arti |
|---|---|
| `VITE_UMAMI_WEBSITE_ID` | Id situs di Umami. **Kosong = analytics mati total** (bawaan dev, test, CI) |
| `VITE_UMAMI_URL` | Prefiks first-party, bawaan `/analitik` → `POST /analitik/api/send` |

Dev: `docker compose -f docker-compose.dev.yml --profile analitik up -d umami` (port 3010, admin
bawaan `admin`/`umami` — DEV SAJA), proxy Vite `/analitik` → `:3010`. Produksi: reverse proxy
Phase 16 (utang **U-33**).
