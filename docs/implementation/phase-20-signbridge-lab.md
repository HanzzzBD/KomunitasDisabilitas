---
phase: 20
name: "SignBridge Lab & Jalur v2"
prs: PR-120..PR-126 (7 PR)
sprint: "di luar sprint MVP — paralel"
depends_on: []
source_of_truth: ADR-010 (tidak diubah) + SDD §7.4 + docs/signbridge-v2-gate-log.md
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 20 - SignBridge Lab & Jalur v2

> **STATUS: rencana. Belum ada kode, belum ada dependency, belum ada artefak model.**
>
> Phase ini adalah **rumah resmi SignBridge v2 di roadmap** — beserta prototipe yang
> mendahuluinya. Tiga hal yang harus dibaca sebelum apa pun:
>
> 1. **ADR-010 tidak diubah oleh phase ini.** Definisi `v2` tetap sebagaimana ADR-010 dan
>    SDD §7.4: penerjemah dua arah kontinu, service terpisah di belakang AI Gateway, di
>    balik gerbang riset. Phase ini **memberi v2 nomor PR dan halaman**, bukan menyatakan
>    gerbangnya terbuka.
> 2. **Phase ini tidak menyandera rilis.** Ia di luar sprint MVP dan bukan dependensi
>    Phase 17 maupun Phase 18. Pola ini mengikuti [Phase 19](phase-19-community.md).
>    PR-001..PR-119 tidak berubah sama sekali.
> 3. **PR-120..PR-125 membangun prototipe, bukan v2.** Namanya **SignBridge Lab**.
>    Implementasi v2 yang sesungguhnya baru didefinisikan setelah PR-126 (gerbang) memberi
>    hasil, dan akan menempati nomor PR-127 ke atas.

## Overview

Dua pekerjaan yang saling menyambung dalam satu phase:

**SignBridge Lab (PR-120..PR-125)** — prototipe pengenal isyarat yang berjalan penuh di
peramban, dipakai untuk pameran dan pitching, plus perkakas yang mulai memproduksi data
BISINDO milik sendiri. Semua ini dapat dibangun **sekarang**, dengan data yang sudah ada.

**Jalur v2 (PR-126 dan seterusnya)** — evaluasi gerbang ADR-010 yang memutuskan **build vs
partner**, dan menjadi pintu masuk implementasi v2 yang sebenarnya.

Seluruh penilaian dataset, kriteria, dan status gerbang hidup di
[`docs/signbridge-v2-gate-log.md`](../signbridge-v2-gate-log.md). Dokumen itu adalah
sumber kebenaran untuk phase ini; dokumen phase ini adalah rencana eksekusinya.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway,
> no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat
> [README.md](README.md#konvensi-global).

## Scope Boundaries

**Masuk phase ini:**

* Workspace baru `apps/signbridge-lab` — halaman statis, tanpa server, tanpa GPU.
* Pengenalan abjad BISINDO (jalur utama pameran) dan pengenalan 12 kata (bersyarat).
* Mode pameran: offline penuh, tanpa menyimpan atau mengirim frame.
* Perkakas perekaman + metadata korpus milik sendiri.
* Evaluasi gerbang v2.

**Tidak masuk phase ini:**

* **Perubahan apa pun pada monolith** — `apps/api` dan `apps/worker` tidak disentuh.
* **Pipeline training** — hidup di repo terpisah (`nawasena-signbridge-lab`); phase ini
  hanya mengonsumsi artefak modelnya.
* **Implementasi v2** — terjemahan kontinu, segmentasi, arah teks→isyarat. Menunggu PR-126.
* **Perubahan pada ADR-010, SDD §7.4, atau PR-001..PR-119.**

## Dependencies

`depends_on: []` — **dan itu disengaja.** Lab dirancang tanpa dependensi phase lain justru
supaya bisa berjalan paralel tanpa menyentuh critical path. Yang membatasi PR-124 bukan
dependensi teknis melainkan **gerbang clearance lisensi** (gate-log §11.3), dan yang
membatasi PR-126 adalah **gerbang riset ADR-010** — keduanya gerbang, bukan PR.

Satu keterkaitan lunak: PR-125 (perkakas rekaman) berbagi program perekaman dengan
[Phase 14](phase-14-signbridge-simplify.md) — juru bahasa yang sama merekam untuk kamus v1
dan untuk korpus. Keterkaitan ini menghemat biaya, tetapi bukan dependensi: kedua phase
dapat berjalan sendiri-sendiri.

## Deliverables

* **PR-120** - Kerangka aplikasi SignBridge Lab
* **PR-121** - Kamera + ekstraksi keypoint di peramban
* **PR-122** - Pengenal abjad BISINDO (jalur utama pameran)
* **PR-123** - Mode pameran (offline, privasi, batas kemampuan)
* **PR-124** - Pengenal 12 kata BISINDO (bersyarat clearance)
* **PR-125** - Perkakas rekaman & metadata korpus
* **PR-126** - Evaluasi gerbang v2 (build vs partner)

## Pull Requests

### PR-120 - SignBridge Lab — Kerangka Aplikasi

#### Objective

**Workspace `apps/signbridge-lab` dengan kerangka a11y dan penamaan yang benar sejak commit pertama.**

Bisnis: prototipe pameran punya rumah yang ikut terbangun saat proyek di-build. Teknis:
Vite statis, tanpa server; label prototipe dan daftar kosakata terbuka adalah bagian
kerangka, bukan tempelan di akhir.

#### Scope

* Scaffold workspace + build masuk `pnpm build` dan a11y gate CI
* Kerangka halaman: judul, label prototipe, daftar kata yang dikenali, panel penjelasan

#### Technical Notes

**Backend Changes:** Tidak ada. Monolith tidak disentuh.

**Frontend Changes:** Workspace baru `apps/signbridge-lab` (Vite + TypeScript strict).

**Database Changes:** Tidak ada.

**API Changes:** Tidak ada.

**Security Considerations:**

* Halaman statis tanpa backend — tidak ada permukaan serang server.
* Belum ada akses kamera di PR ini.

**Testing Checklist:**

* [ ] Unit Test (render kerangka)
* [ ] Integration Test (N/A)
* [ ] E2E Test (halaman termuat)
* [ ] Accessibility Test (axe + Lighthouse)
* [ ] Manual Verification (build produksi)

**Deliverables:** Kerangka aplikasi SignBridge Lab

**Out of Scope:** Kamera, model, inferensi.

**Rollback Strategy:** RB-Std. Workspace berdiri sendiri — dihapus tanpa efek ke app lain.

#### Acceptance Criteria

* [ ] `pnpm build` membangun workspace ini tanpa menyentuh `apps/api`/`apps/worker`.
* [ ] Label **"prototipe"** terbaca tanpa harus dicari.
* [ ] Nama yang tampil **"SignBridge Lab — prototipe pengenal isyarat"**; string
      "penerjemah", "translator", dan "v2" **tidak ada** di seluruh teks UI.
* [ ] Daftar kosakata yang dikenali tampil terbuka.
* [ ] axe pass; kontras dan ukuran target sentuh memenuhi WCAG 2.2 AA.

#### Dependencies

* Tidak ada.

#### Risks

* Penamaan melenceng seiring waktu. Mitigasi: test yang menolak string terlarang di UI
  (AC ketiga) — penamaan dijaga mesin, bukan ingatan.

### PR-121 - Kamera & Ekstraksi Keypoint di Peramban

#### Objective

**Akses kamera atas permintaan pengguna + ekstraksi keypoint MediaPipe, tanpa model pengenal.**

Bisnis: memastikan bagian terberat (kamera + keypoint) jalan di perangkat pameran sebelum
model dipasang. Teknis: seluruh proses di perangkat; tidak ada frame yang keluar.

#### Scope

* Tombol nyalakan/matikan kamera + indikator status
* Ekstraksi keypoint + visualisasi landmark
* Pengukuran FPS untuk verifikasi kelayakan CPU

#### Technical Notes

**Backend Changes:** Tidak ada.

**Frontend Changes:** Modul kamera + pembungkus MediaPipe di `apps/signbridge-lab`.

**Database Changes:** Tidak ada.

**API Changes:** Tidak ada.

**Security Considerations:**

* **Kamera tidak menyala otomatis** — selalu atas tindakan pengguna.
* **Tidak ada frame dikirim atau disimpan.** Tanpa unggahan, tanpa telemetri gambar.
* Indikator kamera aktif terlihat jelas.

**Testing Checklist:**

* [ ] Unit Test (state kamera)
* [ ] Integration Test (N/A)
* [ ] E2E Test (nyala → mati, izin ditolak)
* [ ] Accessibility Test (status diumumkan SR)
* [ ] Manual Verification (perangkat pameran nyata)

**Deliverables:** Kamera + ekstraksi keypoint di peramban

**Out of Scope:** Model, inferensi, klasifikasi.

**Rollback Strategy:** RB-Std.

#### Acceptance Criteria

* [ ] Kamera hanya menyala setelah tindakan pengguna eksplisit.
* [ ] Izin kamera ditolak → pesan jelas Bahasa Indonesia sederhana + halaman tetap berguna.
* [ ] Tidak ada permintaan jaringan berisi data gambar (diverifikasi di network panel).
* [ ] Status kamera diumumkan lewat live region.
* [ ] FPS ekstraksi tercatat dan memenuhi ambang kelayakan di perangkat target.

#### Dependencies

* PR-120

#### Risks

* Performa berbeda jauh antar perangkat. Mitigasi: uji di perangkat yang benar-benar
  dipakai saat pameran, bukan di laptop pengembang.

### PR-122 - Pengenal Abjad BISINDO — Jalur Utama Pameran

#### Objective

**Muat model abjad + tampilkan huruf yang dikenali; pengunjung mengeja namanya.**

Bisnis: **inilah demo yang pasti jalan** — D1+D3 berlisensi CC BY 4.0, tanpa syarat
tambahan dan tanpa menunggu izin siapa pun (gate-log §11.6). Teknis: artefak model dimuat
sebagai aset statis; inferensi di peramban.

#### Scope

* Muat artefak model abjad + inferensi per frame
* Tampilan huruf berjalan + rangkaian huruf yang terbentuk
* Jalur mencoba tanpa memeragakan isyarat (klip contoh)

#### Technical Notes

**Backend Changes:** Tidak ada.

**Frontend Changes:** Modul inferensi + tampilan hasil.

**AI Changes:** Tidak ada panggilan LLM — model lokal, bukan lewat AI Gateway.

**Database Changes:** Tidak ada.

**API Changes:** Tidak ada.

**Security Considerations:**

* Model dimuat dari aset lokal, bukan dari host pihak ketiga.
* Tetap tanpa pengiriman frame.

**Testing Checklist:**

* [ ] Unit Test (pemetaan keluaran → huruf)
* [ ] Integration Test (muat model)
* [ ] E2E Test (klip contoh → huruf muncul)
* [ ] Accessibility Test (axe + pengumuman hasil SR)
* [ ] Manual Verification (peraga manusia)

**Deliverables:** Pengenal abjad BISINDO

**Out of Scope:** Pengenalan kata; koreksi ejaan; kamus.

**Rollback Strategy:** RB-Std; artefak model dapat ditarik tanpa mengubah kode.

#### Acceptance Criteria

* [ ] Mengeja kata pendek berhasil end-to-end pada peraga manusia.
* [ ] Hasil diumumkan lewat live region, tidak hanya berubah secara visual.
* [ ] **Ada jalur mencoba tanpa harus memeragakan isyarat** (klip contoh) — pengunjung yang
      tidak dapat memperagakan tetap memahami demonya.
* [ ] Batas kemampuan tertulis: *"Mengenali abjad BISINDO A–Z. Belum mengenali kata atau
      kalimat."*
* [ ] Atribusi dataset (CC BY 4.0) tampil di halaman.
* [ ] axe pass; operable penuh dengan keyboard.

#### Dependencies

* PR-121

#### Risks

* Akurasi jatuh pada pencahayaan booth. Mitigasi: uji di kondisi cahaya menyerupai lokasi;
  sediakan panduan posisi tangan di layar.

### PR-123 - Mode Pameran

#### Objective

**Offline penuh, reset otomatis antar pengunjung, panel privasi & batas kemampuan.**

Bisnis: booth ramai, wifi buruk, pengunjung silih berganti. Teknis: seluruh aset
di-precache; tidak ada permintaan jaringan saat berjalan.

#### Scope

* Mode kiosk: reset state setelah idle
* Panel privasi + panel batas kemampuan permanen
* Verifikasi berjalan tanpa jaringan sama sekali

#### Technical Notes

**Backend Changes:** Tidak ada.

**Frontend Changes:** Mode pameran + precache aset.

**Database Changes:** Tidak ada.

**API Changes:** Tidak ada.

**Security Considerations:**

* Reset antar pengunjung memastikan tidak ada sisa data pengunjung sebelumnya di layar.
* Pernyataan privasi terlihat permanen, bukan di balik tautan.

**Testing Checklist:**

* [ ] Unit Test (timer reset)
* [ ] Integration Test (precache)
* [ ] E2E Test (jalan dengan jaringan dimatikan)
* [ ] Accessibility Test (reduce-motion dihormati)
* [ ] Manual Verification (gladi booth)

**Deliverables:** Mode pameran

**Out of Scope:** Analitik pengunjung; penyimpanan hasil.

**Rollback Strategy:** RB-Std; mode pameran di balik flag.

#### Acceptance Criteria

* [ ] Berjalan penuh dengan jaringan **dimatikan total**.
* [ ] Reset otomatis setelah idle; tidak ada sisa data pengunjung sebelumnya.
* [ ] Panel privasi terlihat permanen dalam bahasa sederhana.
* [ ] `prefers-reduced-motion` dihormati — tanpa animasi hasil yang berkedip.
* [ ] Nama dan batas kemampuan tetap tampil di seluruh mode.

#### Dependencies

* PR-122

#### Risks

* Perangkat pameran berbeda dari perangkat uji. Mitigasi: gladi di perangkat final
  minimal satu minggu sebelum hari-H.

### PR-124 - Pengenal 12 Kata BISINDO — BERSYARAT CLEARANCE

#### Objective

**Mode pengenalan 12 kata dari model D4, dipasang HANYA bila clearance lisensi turun.**

Bisnis: pengunjung mencoba pengenalan kata, bukan sekadar huruf. Teknis: model temporal di
atas keypoint; ditambahkan sebagai mode kedua, bukan mengganti jalur abjad.

#### Scope

* Mode kata + peralihan antar mode
* Daftar 12 kata tampil terbuka

#### Technical Notes

**Backend Changes:** Tidak ada.

**Frontend Changes:** Mode kedua + pemilih mode.

**Database Changes:** Tidak ada.

**API Changes:** Tidak ada.

**Security Considerations:**

* **Gerbang lisensi wajib lolos** sebelum PR ini boleh di-merge — lihat gate-log §11.3.
  Dalam CC 4.0, "Share" mencakup *public display*; menayangkan model turunan D4 di depan
  publik tanpa izin adalah risiko nyata, bukan formalitas.

**Testing Checklist:**

* [ ] Unit Test (pemetaan keluaran → kata)
* [ ] Integration Test (peralihan mode)
* [ ] E2E Test (klip contoh → kata muncul)
* [ ] Accessibility Test (axe + pengumuman SR)
* [ ] Manual Verification (peraga manusia)

**Deliverables:** Pengenal 12 kata BISINDO

**Out of Scope:** Kata di luar 12 kelas; kalimat; segmentasi otomatis.

**Rollback Strategy:** RB-Std; mode kata di balik flag — dimatikan tanpa menyentuh jalur
abjad, sehingga pameran tetap jalan.

#### Acceptance Criteria

* [ ] **Bukti clearance tertulis terlampir di deskripsi PR.** Tanpa itu, PR tidak
      di-merge — apa pun keadaan jadwalnya.
* [ ] Daftar 12 kata tampil terbuka; pengunjung tahu apa yang bisa dicoba.
* [ ] Batas kemampuan tertulis: *"Mengenali 12 kata terpisah. Belum menerjemahkan kalimat."*
* [ ] Atribusi dataset + penulis asli (WL-BISINDO) tampil di halaman.
* [ ] Jalur abjad tetap berfungsi bila mode kata dimatikan.
* [ ] axe pass.

#### Dependencies

* PR-123
* Gerbang clearance gate-log §11.3 (bukan PR)

#### Risks

* Clearance tidak turun tepat waktu. Mitigasi: **jalur abjad PR-122 adalah lantainya** —
  pameran tidak pernah bergantung pada PR ini. Keputusan fallback diambil di minggu ke-8,
  bukan di hari pameran.

### PR-125 - Perkakas Rekaman & Metadata Korpus

#### Objective

**Perekaman terkendali dengan metadata korpus dan jejak persetujuan sejak rekaman pertama.**

Bisnis: data BISINDO milik sendiri menghapus seluruh masalah lisensi secara permanen, dan
membuka opsi merilis korpus terbuka. Teknis: yang membedakan dataset berguna dari dataset
sia-sia adalah metadata di saat perekaman — bukan jumlah videonya (gate-log §4).

#### Scope

* Skema metadata korpus + form perekaman
* Alur persetujuan tertulis yang dapat dicabut
* Ekspor untuk anotasi (ELAN)

#### Technical Notes

**Backend Changes:** Tidak ada di `apps/api`. Bila kelak butuh penyimpanan terpusat,
diajukan sebagai PR tersendiri dengan keputusan arsitektur eksplisit.

**Frontend Changes:** Perkakas perekaman di `apps/signbridge-lab`.

**Database Changes:** Tidak ada di skema monolith.

**API Changes:** Tidak ada.

**Security Considerations:**

* **UU PDP (UU 27/2022).** Video wajah dan tubuh adalah data pribadi. Wajib: persetujuan
  eksplisit dan terpisah, pembatasan tujuan, hak menarik diri, dan penghapusan yang benar
  termasuk dari data latih turunannya.
* Persetujuan mencakup dua hal berbeda dan ditanyakan terpisah: izin melatih model, dan
  izin publikasi.
* Penutur diberi kompensasi. Ini syarat, bukan preferensi.

**Testing Checklist:**

* [ ] Unit Test (validasi metadata wajib)
* [ ] Integration Test (ekspor)
* [ ] E2E Test (rekam → metadata → ekspor)
* [ ] Accessibility Test (form + alur consent aksesibel bagi penutur Tuli)
* [ ] Manual Verification (sesi rekaman nyata)

**Deliverables:** Perkakas rekaman & metadata korpus

**Out of Scope:** Anotasi ELAN itu sendiri; training; kontribusi publik dari pengguna
(menunggu produk punya pengguna).

**Rollback Strategy:** RB-Std. Data yang sudah direkam **tidak** ikut di-rollback.

#### Acceptance Criteria

* [ ] Rekaman **tidak dapat disimpan** tanpa `signer_id`, varian regional, `consent_ref`,
      status anotasi, dan kondisi rekaman.
* [ ] Persetujuan terekam terpisah untuk pelatihan model dan untuk publikasi.
* [ ] Penarikan persetujuan menghapus rekaman dan tercatat jejaknya.
* [ ] Alur consent tersedia dalam BISINDO atau teks sederhana — penutur Tuli memahami apa
      yang disetujuinya.
* [ ] Ekspor menghasilkan struktur yang siap dianotasi.

#### Dependencies

* PR-120

#### Risks

* Metadata terasa merepotkan lalu dilewati saat sesi padat. Mitigasi: field wajib
  ditegakkan perkakas (AC pertama), bukan diserahkan pada disiplin operator.
* Program perekaman meluas menelan waktu MVP. Mitigasi: paralel dan berbatas; MVP tetap
  prioritas — tanpa produk yang rilis, tidak ada komunitas yang berkontribusi.

### PR-126 - Evaluasi Gerbang v2 (Build vs Partner)

#### Objective

**Evaluasi resmi gerbang ADR-010 dan keputusan build vs partner — dokumen, bukan kode.**

Bisnis: keputusan terbesar SignBridge diambil berdasarkan bukti, bukan antusiasme. Teknis:
tidak ada kode sama sekali; keluarannya rekomendasi dengan bukti yang dapat ditunjuk.

#### Scope

* Rekap tiga syarat gerbang + bukti masing-masing
* Rekap hasil eksperimen + korpus yang sudah terkumpul
* Rekomendasi: build, partner, atau tunda — dengan alasan

#### Technical Notes

**Backend/Frontend/Database/API Changes:** Tidak ada.

**Security Considerations:** Tidak ada permukaan teknis. Yang dijaga di sini adalah
**kejujuran bukti** — hasil negatif ikut dilaporkan (gate-log §10.7).

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (N/A)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (review owner + tech lead)

**Deliverables:** Keputusan gerbang v2 terdokumentasi

**Out of Scope:** Implementasi v2 — menempati PR-127 ke atas, didefinisikan setelah PR ini.

**Rollback Strategy:** N/A (dokumen).

#### Acceptance Criteria

* [ ] Ketiga syarat ADR-010 dinilai dengan bukti yang dapat ditunjuk, bukan kesan.
* [ ] Hasil eksperimen dilaporkan apa adanya, termasuk angka yang mengecewakan.
* [ ] Rekomendasi menyebut **build, partner, atau tunda** secara eksplisit, dengan alasan.
* [ ] `docs/signbridge-v2-gate-log.md` §6 dan §9 diperbarui.
* [ ] Bila gerbang tetap tertutup, itu dicatat sebagai hasil yang sah — bukan kegagalan
      phase ini.

#### Dependencies

* PR-125
* Hasil eksperimen gate-log §10 (di luar repo ini)

#### Risks

* Godaan meluluskan gerbang karena sudah terlanjur berinvestasi. Mitigasi: ambang
  penafsiran ditulis lebih dulu di gate-log §10.7, sebelum angkanya diketahui.

## Jalur v2 — apa yang terjadi setelah PR-126

**Definisi `v2` tidak berubah** dan tidak boleh diubah oleh phase ini: penerjemah dua arah
BISINDO ↔ Bahasa Indonesia berbasis computer vision, service terpisah (Python, host GPU
sendiri) di belakang AI Gateway, kontrak di SDD §7.4. ADR-010 tetap berlaku utuh.

**Syarat masuk** (status terkini di gate-log §6):

| Syarat ADR-010 | Status per 2026-08-21 |
|---|---|
| Dataset BISINDO tersedia/termitrakan | ⚠️ sebagian — ada untuk isyarat terisolasi, tidak untuk terjemahan kontinu |
| Pendanaan GPU jelas | ✅ terpenuhi |
| North Star awal tercapai | ❌ belum — produk belum rilis |

**Setelah gerbang terbuka**, implementasi v2 didefinisikan sebagai blok PR baru mulai
**PR-127**, dengan dokumen phase-nya sendiri bila ukurannya menuntut. Isinya mengikuti
kontrak SDD §7.4 — sesi terjemahan, WS/WebRTC, penambahan route provider di AI Gateway —
dan arah teks→isyarat kemungkinan besar memakai rangkaian klip kamus v1 (Phase 14), bukan
avatar computer vision. Jalur itu jauh lebih murah dan kualitasnya lebih baik untuk tim
seukuran ini.

**Bila gerbang tetap tertutup**, phase ini tetap menghasilkan nilai: prototipe untuk
pameran, korpus BISINDO milik sendiri, dan keputusan yang berdasar. Itu bukan kegagalan —
itu memang fungsi sebuah gerbang.

## Exit Criteria

Phase 20 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* PR-120..PR-123, PR-125, dan PR-126 merged.
* **PR-124 merged ATAU dicatat resmi sebagai ditunda karena clearance tidak turun** —
  keduanya penutupan yang sah.
* CI hijau penuh: lint boundaries, typecheck, unit, a11y gate.
* `apps/api` dan `apps/worker` terbukti tidak berubah sepanjang phase ini.
* Tidak ada string "penerjemah", "translator", atau "v2" di teks UI SignBridge Lab.
* `docs/signbridge-v2-gate-log.md` §6, §9, §10, dan §11 mencerminkan keadaan sebenarnya.

Exit criteria phase ini **tidak menjadi syarat rilis v1.0.0** dan bukan dependensi Phase 17
maupun Phase 18.

## Next Phase

Tidak ada. Phase 20 berjalan paralel di luar sprint MVP. Kelanjutannya adalah implementasi
v2 (PR-127+) — **hanya bila** PR-126 membuka gerbangnya.
