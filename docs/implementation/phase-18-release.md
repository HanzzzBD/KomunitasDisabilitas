---
phase: 18
name: "Release"
prs: PR-109..PR-112 (4 PR)
sprint: "8+ (minggu 17-18)"
depends_on: [11, 12, 13, 14, 15, 16, 17]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 18 - Release

## Overview

Gerbang rilis: sweep a11y otomatis penuh, audit formal penguji disabilitas (gate non-kompresibel), RC soak+Play readiness, dan launch v1.0.0 + pilot komunitas.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 11 - Matching Engine](phase-11-matching-engine.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 12 - Applications](phase-12-applications.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 13 - Admin Dashboard & Analytics](phase-13-admin-analytics.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 14 - SignBridge v1 & Simplify](phase-14-signbridge-simplify.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 15 - Mobile (Android)](phase-15-mobile-android.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 16 - Infrastructure & Observability](phase-16-infrastructure-observability.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 17 - Security Hardening & PDP Compliance](phase-17-security-pdp-hardening.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-109** - Baseline a11y otomatis bersih
* **PR-110** - Laporan audit RC + produk lulus gate aksesibilitas
* **PR-111** - RC ditandatangani + app di internal track
* **PR-112** - Nawasena v1.0.0 live + pilot berjalan

## Pull Requests

### PR-109 - A11y Full Sweep Otomatis

#### Objective

**axe + Lighthouse seluruh halaman + lint a11y mobile — 0 pelanggaran.**

Bisnis: baseline bersih sebelum audit manusia (penguji fokus pada hal yang mesin tak bisa temukan). Teknis: registry halaman dilengkapi 100% route, sweep penuh, perbaiki semua temuan otomatis tanpa suppress.

#### Scope

* Lengkapi registry halaman (semua route web)
* Perbaikan seluruh temuan axe/Lighthouse
* Sweep lint a11y mobile

#### Technical Notes

**Backend Changes:**

* Perbaikan pesan error yang tidak jelas (bila ditemukan).

**Frontend Changes:**

* Perbaikan menyebar (web).

**Mobile Changes:**

* Perbaikan lint a11y.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (regresi komponen diperbaiki)
* [ ] Integration Test (N/A)
* [ ] E2E Test (regresi alur inti)
* [ ] Accessibility Test (sweep penuh — inilah PR-nya)
* [ ] Manual Verification (sampling NVDA)

**Deliverables:**

* Baseline a11y otomatis bersih

**Out of Scope:**

* Audit manusia (PR-110).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] 0 pelanggaran axe di SEMUA halaman terdaftar (tanpa suppress).
* [ ] Lighthouse a11y = 100 semua route; perf ≥ 80.
* [ ] Registry halaman = 100% route produksi (assert vs router).
* [ ] Lint a11y mobile bersih.
* [ ] Daftar perbaikan terdokumentasi (input audit manusia).

#### Dependencies

* PR-074
* PR-079
* PR-081
* PR-086
* PR-087

#### Risks

* Temuan besar terlambat. Mitigasi: gate per-PR (PR-031) seharusnya membuat sweep ini kecil.


### PR-110 - Audit Formal Penguji Disabilitas + Perbaikan Blocker

#### Objective

**Gate rilis: ≥5 penguji lintas ragam, skenario end-to-end, tutup semua blocker.**

Bisnis: klaim "100% aksesibel" diverifikasi penggunanya sendiri — gate rilis PRD §7 (risiko R3). Teknis: sesi terstruktur (NVDA, TalkBack, keyboard-only, low vision, teks sederhana) skenario daftar→onboarding→profil→CV→lamar→tracking; semua blocker/critical diperbaiki + re-verifikasi.

#### Scope

* Rekrut & jadwalkan ≥5 penguji (lintas ragam: Tuli, Netra, Daksa, Autisme)
* Sesi terstruktur + laporan `docs/a11y-audit-rc.md`
* Perbaikan blocker + re-test per temuan

#### Technical Notes

**Backend Changes:**

* Perbaikan sesuai temuan.

**Frontend Changes:**

* Perbaikan sesuai temuan (web).

**Mobile Changes:**

* Perbaikan sesuai temuan (TalkBack).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Penguji = subjek PDP: consent partisipasi + kompensasi wajar; akun uji, bukan data pribadi riil.

**Testing Checklist:**

* [ ] Unit Test (regresi perbaikan)
* [ ] Integration Test (N/A)
* [ ] E2E Test (alur inti hijau pasca-perbaikan)
* [ ] Accessibility Test (audit manusia — inilah PR-nya)
* [ ] Manual Verification (re-test per temuan)

**Deliverables:**

* Laporan audit RC + produk lulus gate aksesibilitas

**Out of Scope:**

* Temuan non-blocker (backlog pasca-launch terdokumentasi).

**Rollback Strategy:**

Tidak ada rollback — gate tidak lulus = rilis ditunda (by design).

#### Acceptance Criteria

* [ ] ≥5 penguji, minimal 4 ragam disabilitas terwakili.
* [ ] Task success rate ≥ 90% pada alur inti (KPI PRD §15).
* [ ] 100% kriteria WCAG 2.2 AA kritis lulus (checklist per halaman).
* [ ] Semua blocker/critical ditutup + re-verifikasi oleh penguji asal.
* [ ] Laporan audit + known-issues non-blocker terdokumentasi & ditandatangani.

#### Dependencies

* PR-109
* PR-094

#### Risks

* Temuan tak terprediksi menggeser jadwal (T10). Mitigasi: penguji terlibat per sprint sejak Sprint 3 — audit RC = konfirmasi, bukan kejutan.


### PR-111 - RC — Staging Soak + Play Store Readiness

#### Objective

**Soak 1 minggu + listing Play internal→production + checklist RC.**

Bisnis: keyakinan operasional sebelum pengguna nyata. Teknis: staging soak 7 hari (Kuma bersih), listing Play (deskripsi & aset aksesibel, data safety form), `docs/rc-checklist.md` ditandatangani.

#### Scope

* Soak 7 hari + triase temuan
* Play Console: listing, data safety, internal testing track
* Checklist RC (teknis + non-teknis)

#### Technical Notes

**Backend Changes:**

* Perbaikan temuan soak (bila ada).

**Frontend Changes:**

* Aset toko (screenshot ber-caption).

**Mobile Changes:**

* Build production-signed via EAS ke internal track.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Data safety form Play akurat (deklarasi data & enkripsi); signing key EAS aman.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (N/A)
* [ ] E2E Test (smoke penuh staging tiap hari soak)
* [ ] Accessibility Test (aset toko ber-caption)
* [ ] Manual Verification (checklist bersama tim)

**Deliverables:**

* RC ditandatangani + app di internal track

**Out of Scope:**

* Launch (PR-112).

**Rollback Strategy:**

Temuan soak besar → perpanjang soak; tidak memaksakan tanggal.

#### Acceptance Criteria

* [ ] 7 hari soak: uptime bersih, error rate normal, backup harian sukses.
* [ ] Build internal track lulus review internal tim.
* [ ] Data safety form konsisten dengan kebijakan privasi (PR-107).
* [ ] ≥100 lowongan kurasi termuat (prasyarat non-teknis R1 — verifikasi).
* [ ] rc-checklist.md lengkap ditandatangani (go/no-go terjadwal).

#### Dependencies

* PR-110
* PR-104
* PR-105
* PR-106
* PR-107
* PR-108

#### Risks

* Review Play lambat/ditolak. Mitigasi: submit internal track lebih awal; data safety teliti.


### PR-112 - v1.0.0 Production Launch

#### Objective

**Tag v1.0.0 → prod + Play production + pilot komunitas.**

Bisnis: MVP live untuk pilot 1–2 komunitas disabilitas (menuju North Star ≥50 penempatan tahun 1). Teknis: deploy prod via approval (PR-101), rollout Play bertahap, monitoring intensif 48 jam, on-call terjadwal.

#### Scope

* Eksekusi rilis + rollout Play bertahap (20%→100%)
* Monitoring intensif + go/no-go pilot
* Pengumuman ke komunitas pilot (materi aksesibel)

#### Technical Notes

**Backend Changes:**

* Tidak ada (eksekusi rilis).

**Frontend Changes:**

* Tidak ada.

**Mobile Changes:**

* Promosi internal → production track.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Rollback siap (digest + backup); on-call memahami runbook insiden (PR-107).

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (N/A)
* [ ] E2E Test (smoke prod)
* [ ] Accessibility Test (spot-check prod)
* [ ] Manual Verification (alur nyata akun uji di prod)

**Deliverables:**

* Nawasena v1.0.0 live + pilot berjalan

**Out of Scope:**

* Fitur Fase 2 (roadmap ADR-013).

**Rollback Strategy:**

`--rollback` prod + halt rollout Play + komunikasi jujur ke pilot (template di runbook).

#### Acceptance Criteria

* [ ] Prod sehat 48 jam (uptime, error rate, latensi dalam ambang).
* [ ] Funnel analytics mengalir dengan data nyata (PR-082).
* [ ] Play rollout 100% tanpa crash-rate anomali.
* [ ] Pilot onboard: 1–2 komunitas + kanal dukungan (WA/email) aktif.
* [ ] Retrospektif rilis dijadwalkan.

#### Dependencies

* PR-111

#### Risks

* Lonjakan tak terduga. Mitigasi: rollout bertahap + rate limit + monitoring intensif.


## Exit Criteria

Phase 18 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 4 PR (PR-109..PR-112) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

Tidak ada - v1.0.0 live. Lanjutan: roadmap Fase 2 produk (ADR-013), retrospektif rilis, dan backlog known-issues non-blocker dari audit a11y (PR-110).
