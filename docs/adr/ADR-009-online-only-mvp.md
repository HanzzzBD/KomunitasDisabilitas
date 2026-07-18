# ADR-009 — Online-only MVP

Status: Accepted

Tanggal: 2026-07-15

## Context

Sebagian pengguna target Incasif memakai koneksi 3G/kuota terbatas (PRD §7: interaktif < 3 detik pada 3G). Strategi offline memiliki spektrum biaya: dari online-only hingga offline-first dengan sinkronisasi dua arah. Timeline MVP 3–4 bulan dengan tim 2–5 orang menuntut pemangkasan kompleksitas yang tidak esensial untuk validasi.

Constraint: fitur inti (feed matching, apply, chat AI) secara inheren membutuhkan server; nilai offline pada MVP terbatas pada pembacaan konten.

Alternatif yang dipertimbangkan:
1. **Offline-first penuh (RxDB/WatermelonDB)** — pengalaman terbaik di koneksi buruk, tetapi kompleksitas sinkronisasi dua arah tidak sebanding untuk validasi.
2. **PWA + offline dasar** — nilai tambah moderat, tetap menambah scope service worker + cache invalidation di timeline ketat.
3. **Online-only dengan fondasi PWA** — tanpa fitur offline, dengan jalur upgrade murah.

## Decision

MVP Incasif adalah **online-only**. Saat offline, aplikasi menampilkan banner `role="alert"` berbahasa sederhana dengan tombol coba lagi; TanStack Query dikonfigurasi `networkMode: 'online'` sehingga mutasi tertahan, tidak gagal diam-diam. Fondasi PWA (manifest + service worker untuk cache aset statis saja) tetap dipasang sejak MVP agar peningkatan ke offline dasar pada Fase 2 tidak merombak arsitektur. Kemampuan offline penuh adalah item roadmap Fase 2, bukan penghapusan fitur.

## Consequences

### Positif

* Scope MVP berkurang signifikan — tim fokus pada fitur pembeda (Accessibility Profile, AI CV Builder, Matching, Disclosure Control).
* Tidak ada kelas bug sinkronisasi/konflik data pada fase validasi.
* Optimasi 3G tetap dikerjakan lewat jalur lain (budget JS < 200 KB, lazy loading, CDN).

### Negatif

* Pengguna di area sinyal buruk tidak dapat membaca lowongan tersimpan saat offline.
* Draft chat CV yang sedang berlangsung terhenti saat koneksi putus.

### Mitigasi

* Sesi chat CV disimpan di server per `session_id` — koneksi putus dapat di-resume tanpa kehilangan progres (SDD §20 T7).
* Fondasi PWA terpasang sejak MVP → offline dasar Fase 2 adalah penambahan, bukan penulisan ulang.
* Kinerja 3G dijaga budget performa dan Lighthouse CI (SDD §4.5).

## Referensi

PRD §7; SDD §4.4, §4.5, §20 (T7). Terkait: ADR-011, ADR-014.
