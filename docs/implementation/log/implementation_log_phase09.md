# Implementation Log — Phase 09 (Resume Builder & PDF)

> Catatan per PR yang selesai di Phase 09. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-060 — Resumes BE (Manual CRUD + resumeSchema)

> **Phase:** [09 - Resume Builder & PDF](../phase-09-resume-builder-pdf.md#pr-060---resumes-be--manual-crud--resumeschema)
> **Tanggal:** 2026-09-16
> **Status:** Selesai

### Ringkasan hasil

Modul `resumes` lahir utuh dari router sampai repository — lima endpoint `/me/resumes*` —
beserta **kontrak tunggal isi CV** di `packages/schemas/src/resumes.ts`, yang sampai PR ini
masih berupa skeleton kosong dari PR-004. Tidak ada migrasi: tabel `resumes` (kolom
`content jsonb`, `pdf_url`, `created_via`) sudah ada sejak migrasi 02 (PR-010), dan PR ini
memang tugasnya memakainya.

Ini **jalur non-AI pembuatan CV**, dan itu bukan fitur cadangan yang enak dimiliki:
graceful degradation adalah kewajiban produk (PRD), dan yang membuatnya mungkin adalah
kenyataan bahwa seluruh modul ini tidak menyentuh `core/ai` sama sekali. Kuota habis,
Gemini tumbang, Groq ikut tumbang — pengguna tetap bisa menyusun CV lengkap.

Empat keputusan yang membentuk seluruh sisanya:

**1. Isi CV punya DUA skema, bukan satu.** `resumeContentSchema` (bentuk yang DIBACA —
seluruh bagian hadir, termasuk yang kosong) dan `resumeContentInputSchema` (bentuk yang
DITULIS — setiap bagian boleh dihilangkan). Pemisahan ini bukan selera: satu komponen
OpenAPI yang bentuk masuknya berbeda dari bentuk keluarnya — dan `.default()` membuatnya
berbeda, opsional di permintaan tetapi wajib di jawaban — **ditolak generator zod-openapi**,
dan penolakannya menggagalkan SELURUH dokumen, bukan hanya bagian CV. Ini ditemukan dengan
cara paling langsung: tiga percobaan berturut-turut (`ZodDefault`, lalu transform
ber-`effectType`, lalu transform bersarang) semuanya membuat `schemas.test.ts` merah pada
generator OpenAPI, dengan pesan yang menyebut sendiri bahwa `effectType` "tidak berlaku
untuk ZodDefault". Pola yang akhirnya dipakai sudah ada di repo: `createJobSchema` versus
`jobAdminSchema`. Bedanya hanya bahwa isi CV dipakai dua arah pada endpoint yang SAMA,
sehingga keduanya benar-benar bertemu di satu dokumen. Berlaku berpasangan sampai ke
elemen larik (`ResumeExperience` ↔ `ResumeExperienceInput`, dst.) — lima pasang.

**2. Isi CV TIDAK punya tempat bagi field disabilitas, dan itu ditegakkan BENTUK.** Setiap
objek `.strict()`, jadi `disabilityTypes`/`accommodationNeeds` yang menyelinap masuk ditolak
400 di gerbang — bukan diam-diam tersimpan di `jsonb` yang tidak terenkripsi. Alasannya
bukan kerapian skema: CV adalah berkas yang dikirim pengguna ke perusahaan, dan
pengungkapan ragam disabilitas HARUS tetap menjadi keputusan terpisah per lamaran
(PR-075), bukan sesuatu yang ikut terbawa karena pernah diisi sekali di editor CV.
Dijaga dua test — satu di `packages/schemas`, satu lewat HTTP.

**3. Batas lima CV ditegakkan di dalam satu transaksi, di belakang
`pg_advisory_xact_lock` per pengguna — bukan sebagai `count()` terpisah di service.** Dua
POST yang tiba bersamaan akan sama-sama membaca hitungan lama, sama-sama menyimpulkan masih
ada tempat, lalu sama-sama menulis. Batas yang bisa dilewati dengan mengklik dua kali bukan
batas — dan justru klik gandalah yang paling sering terjadi pada koneksi lambat, yakni
keadaan yang paling lazim bagi pengguna yang kita layani.

Versi pertama memakai isolasi `Serializable` + satu kali coba ulang, dan **dibuang sebelum
dikirim**. Alasannya terlihat saat menulis testnya: Serializable menjawab tabrakan dengan
MEMBATALKAN salah satu transaksi (SQLSTATE 40001 → Prisma P2034), jadi repository harus
punya lingkaran coba-ulang — dan lingkaran yang terbatas akan habis di bawah delapan
permintaan serentak, lalu menjawab permintaan yang seharusnya 201 atau 409 dengan **500**.
Batas yang benar tetapi kadang-kadang menjawab "terjadi kesalahan pada server" bukan
perbaikan atas batas yang bisa dilewati; ia hanya kegagalan yang lebih jarang dan lebih
membingungkan. Advisory lock MENUNGGU alih-alih membatalkan, sehingga tidak ada retry sama
sekali dan hasilnya deterministik. Dibuktikan di `resumes-db.test.ts`: delapan POST serentak
pada sisa jatah empat menghasilkan tepat empat keberhasilan dan empat 409.

Kunci lock-nya **dihitung di JavaScript** (`kunciAntreCv`, SHA-1 → int64 bertanda), bukan
oleh `hashtextextended()` PostgreSQL. Alasannya praktis: satu-satunya bagian repository ini
yang tidak punya padanan di tabel palsu adalah SQL mentahnya, dan memindahkan perhitungan ke
JavaScript menyisakan SQL yang tidak punya apa pun untuk salah — sekaligus membuat derivasi
kuncinya bisa diuji tanpa database (stabil, tersebar, dan SELALU muat di jangkauan int8
bertanda; `readBigInt64BE`, bukan unsigned).

**4. `created_via` adalah PARAMETER service, bukan bagian dari badan permintaan.** Endpoint
`/me/resumes` selalu memanggilnya dengan `"manual"`; jalur percakapan AI (PR-066) akan
memanggil service yang SAMA dengan `"ai_chat"`. Itulah yang membuat kedua jalur berbagi satu
tempat penegakan batas, satu kontrak isi, dan satu pemetaan baris — alih-alih dua service
yang lambat laun berbeda pada hal yang tidak ada yang memeriksanya. Klien yang mencoba
mengakui `createdVia: "ai_chat"` ditolak `.strict()`, bukan diabaikan diam-diam: klien yang
mengira nilainya diterima akan menampilkan lencana "dibuat AI" pada CV manual.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm --filter @nawasena/schemas
check:openapi` sinkron. `pnpm test` 9/9 — `@nawasena/api` **116 berkas / 1726 lulus**
(1 skip tak terkait, urutan boot `.env`), `@nawasena/schemas` **4 berkas / 100 lulus**.
Dijalankan dengan **PostgreSQL hidup**, jadi seluruh berkas `*-db.test.ts` benar-benar
berjalan alih-alih dilewati — termasuk kesembilan test `resumes-db.test.ts`. `pnpm db:seed`
diverifikasi manual terhadap database yang sama.

### Scope selesai

**Kontrak (`packages/schemas`)**

* **`src/resumes.ts`** — diisi dari skeleton kosong (PR-004). `RESUME_SCHEMA_VERSION = 1`
  yang ikut tersimpan di setiap dokumen (mitigasi risiko dokumen phase: "skema CV berubah
  setelah dipakai AI"); sembilan bagian isi CV (`schemaVersion`, `headline`, `summary`,
  `contact`, `experiences`, `educations`, `skills`, `certifications`, `organizations`);
  lima pasang skema entri baca/tulis; `resumeSchema`/`resumeSummarySchema` (baris `resumes`),
  `createResumeSchema`/`updateResumeSchema`, `resumeIdParamsSchema`, dua response envelope.
  `dateOnlySchema` **diimpor** dari `profiles.ts` — satu definisi tanggal untuk profil dan CV,
  termasuk penolakan tanggal yang tidak ada di kalender.
* **`src/openapi.ts` + `openapi.json`** — lima endpoint didokumentasikan; penjaga
  `openapi-parity.test.ts` diperluas ke modul baru.

**Core**

* **`core/config/env.ts`** — `RESUME_MAX_PER_USER` (bawaan 5, min 1, maks 50). Punya default
  jadi `.env` lama tetap valid; yang bisa di-override hanya ANGKANYA — bahwa batasnya ada
  tidak bisa dimatikan lewat env. Pola sama dengan blok `RETENTION_*`.
* **`core/http/errors.ts`** — tiga kode baru: `CV_TIDAK_DITEMUKAN` (404),
  `BATAS_CV_TERCAPAI` (409), `CV_DIPAKAI_LAMARAN` (409).
* **`apps/api/.env.example`** — blok CV, dijaga `env-example.test.ts`.

**Modul (`apps/api/src/modules/resumes/`, baru)**

* **`repositories/resumes.repository.ts`** — setiap query menyebut `userId` bersama `id`
  (aturan yang sama dengan `career.repository.ts`): jalur yang lupa memeriksa kepemilikan
  TIDAK BISA DITULIS. `createIfUnderLimit()` (transaksi + `pg_advisory_xact_lock`),
  `kunciAntreCv()` (derivasi kunci, diuji tanpa DB),
  `CvDipakaiLamaranError` (terjemahan P2003 — repository tidak menentukan status HTTP).
  Urutan bawaan `updatedAt desc`, bukan `createdAt`: daftar ini dibuka orang yang hendak
  melanjutkan pekerjaannya, dan yang hendak ia lanjutkan adalah yang terakhir ia sentuh.
* **`services/resumes.service.ts`** — pemetaan baris↔kontrak eksplisit (kolom baru tidak
  punya jalan keluar sendiri), 404 seragam untuk "tidak ada" dan "milik orang lain",
  penerjemahan `CvDipakaiLamaranError` → 409.
* **`controllers/` + `routers/`** — `access.authenticated()` untuk kelimanya,
  `validate({ params, body })` di semua route ber-`:id`.
* **`index.ts`** — factory + `service` dikembalikan untuk PR-063/064/066; dipasang di
  `boot.ts` setelah `profiles`.

**Seed**

* **`prisma/seed-data.ts`** — isi CV keempat persona kini **diparse** lewat
  `resumeContentInputSchema`. Sampai PR ini blok tersebut menulis bentuk karangannya sendiri
  (`{ headline, ringkasan, keahlian }`) — sah sebagai `jsonb`, tetapi tidak bisa dibuka
  editor CV maupun dirender PDF; keempat CV persona adalah data yang tidak bisa dipakai satu
  pun fitur yang akan memakainya. `.parse()`, bukan sekadar anotasi tipe: seed yang menyimpang
  dari kontrak membuat `pnpm db:seed` GAGAL saat itu juga.

  Klausa `update` yang tadinya `{}` kini **menimpa** `title` + `content`, dan itu bukan
  detail: baris fixture ini sudah ada di setiap database dev yang pernah di-seed, membawa
  bentuk lama. Dengan `update: {}`, menjalankan seed baru tidak memperbaikinya sama sekali —
  penyelarasan hanya berlaku bagi orang yang kebetulan memulai dari database kosong.
  Diverifikasi langsung: sebelum perubahan ini, `jsonb_object_keys` pada database dev masih
  menjawab `headline/ringkasan/keahlian` setelah seed dijalankan ulang. Pendidikan dan
  keahlian di blok yang sama memang sudah selalu ditimpa; CV adalah satu-satunya yang tidak.

**Test (4 berkas baru, 1 diperluas)**

* `packages/schemas/__tests__/resumes.test.ts` (31) — bentuk dasar, versi kontrak, penolakan
  field asing & field disabilitas, validasi per-field berbahasa manusia, urutan larik tidak
  berubah, kesepadanan skema tulis → skema baca.
* `apps/api/__tests__/resumes.test.ts` (18) — unit service dengan repository palsu: batas
  dari config (termasuk angkanya muncul di pesan), `createdVia` per jalur, 404 seragam,
  terjemahan FK, pemetaan baris (daftar tanpa `content`, `userId` tidak bocor), plus derivasi
  kunci advisory lock (stabil, berbeda per pengguna, selalu muat di int8 bertanda).
* `apps/api/__tests__/resumes-http.test.ts` (16) — server Express nyata: matriks akses,
  CRUD lengkap, kepemilikan (CV milik B tidak terlihat, tidak bisa diubah/dihapus, dan tidak
  ikut terhitung pada batas milik A), batas 409 + jatah pulih setelah hapus, validasi
  struktur, deklarasi route (PR-019).
* `apps/api/__tests__/resumes-db.test.ts` (9) — PostgreSQL sungguhan, kesembilannya
  **berjalan** (bukan dilewati): urutan `updatedAt`,
  **delapan POST serentak** pada sisa jatah empat, `jsonb` bolak-balik utuh (termasuk
  non-latin + emoji dan urutan larik), FK lamaran menolak hapus CV, cascade `users` tetap
  menyapu keduanya.
* `apps/api/__tests__/openapi-parity.test.ts` — modul `resumes` ikut dirakit.

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| Dua skema isi CV (baca vs tulis), sampai ke elemen larik | Komponen OpenAPI ber-`.default()` yang dipakai dua arah ditolak generator dan menggagalkan seluruh dokumen | Satu skema dengan `effectType: "same"` — DICOBA, generator tetap menolak; satu skema tanpa bawaan sama sekali — ditolak, memaksa klien mengirim `null` eksplisit untuk setiap field opsional |
| Batas CV di transaksi + `pg_advisory_xact_lock` per pengguna | `count()` lalu `create()` bisa dilewati klik ganda; batas yang bisa dilewati bukan batas. Kunci MENUNGGU, jadi tidak ada retry dan tidak ada jawaban 500 di bawah tekanan | Isolasi `Serializable` + coba-ulang — DICOBA lalu dibuang: lingkaran retry terbatas habis di bawah delapan permintaan serentak dan menjawab 500; menerima balapan dengan catatan jujur — ditolak, AC menuntut batasnya ditegakkan |
| `PUT` mengganti `content` UTUH, tidak menggabung | Penggabungan menuntut aturan untuk setiap larik ("kirim `skills` kosong" = hapus semua, atau jangan sentuh?), dan aturan yang harus ditebak akan ditebak berbeda oleh setiap klien | Merge per bagian di server — ditolak; PR-061 mengirim dokumen utuh dengan satu bagian berubah |
| Daftar CV tanpa `content` | Daftar dipakai untuk memilih, bukan membaca; lima dokumen lengkap adalah muatan yang dibayar setiap pengguna pada koneksi seluler tanpa satu pun yang memakainya | Daftar membawa isi penuh — ditolak; editor mengambil satu CV lewat `GET /me/resumes/:id` |
| `access.authenticated()`, bukan `access.self("id")` | `:id` adalah id CV, bukan id pengguna — `requireSelf` akan membandingkannya dengan userId sesi lalu menolak SETIAP permintaan yang sah | `access.self("id")` — ditolak; alasan yang sama sudah dicatat di router `profiles` sejak PR-038 |
| `certifications` ada sejak versi pertama | Bagi banyak pencari kerja penyandang disabilitas, sertifikat pelatihan vokasi adalah bukti kompetensi terkuat yang mereka punya — seringkali lebih kuat daripada riwayat kerja formal yang justru sulit didapat | Menundanya ke pasca-MVP — ditolak; memaksa bukti itu diselipkan ke ringkasan sebagai prosa |
| Bagian `contact` adalah SALINAN, bukan rujukan ke profil | CV adalah dokumen yang dibekukan: nomor HP yang berubah di profil tidak boleh mengubah PDF yang sudah diunduh dan dikirim ke lima perusahaan | Menarik kontak dari `users`/`seeker_profiles` saat render — ditolak; PDF lama berubah isi tanpa pemiliknya tahu |
| Seed diselaraskan ke kontrak, bukan dibiarkan | Empat CV persona yang tidak bisa dibuka editor maupun dirender PDF adalah data rusak yang baru ketahuan di PR-061/063 | Validasi hanya di jalur tulis, seed dibiarkan — ditolak; tidak ada yang akan menemukannya sampai fitur pemakainya lahir |

### Risiko & batas yang diketahui

* **Isi CV TIDAK divalidasi ulang saat dibaca.** Pembacaan memperlakukan `jsonb` sebagai
  `ResumeContent` apa adanya. Yang membenarkannya: satu-satunya jalur tulis adalah gerbang
  zod di router, dan jalur kedua (seed) kini melewati gerbang yang sama — dijaga `.parse()`
  di `seed-data.ts`. Baris yang ditulis tangan langsung ke database (mis. lewat
  `prisma studio`) bisa menyimpang tanpa ketahuan sampai template PDF gagal merendernya.
* **Dua entri OpenAPI per bentuk** (`ResumeExperience` + `ResumeExperienceInput`, dst.) —
  klien mobile yang di-generate dari `openapi.json` (Phase 15) akan melihat sepuluh tipe di
  mana secara konseptual ada lima. Konsekuensi sadar dari keputusan #1; alternatifnya adalah
  dokumen yang tidak bisa dibuat sama sekali.
* **`resumes.service` belum punya satu pun pemanggil di luar router-nya.** Disengaja, pola
  sama dengan `sensitiveAccess` (PR-039): konsumennya sudah bernama dan terjadwal — PR-063
  (render PDF), PR-064 (endpoint unduh), PR-066 (CV dari percakapan).
* **Ukuran `content` dibatasi per-larik, bukan per-dokumen** — terdaftar sebagai
  [U-22](../../utang-teknis.md#u-22--ukuran-dokumen-cv-dibatasi-per-larik-bukan-per-dokumen),
  pemilik **PR-063**. Batas jumlah elemen (30 riwayat kerja, 60 keahlian, dst.) beserta batas
  panjang teks per field membuat batas atas ukuran dokumen terhingga, tetapi tidak ada satu
  pun pemeriksaan atas byte total. Angkanya hanya bisa ditentukan pihak yang tahu berapa RAM
  yang dipakai satu render — dan itu PR-063, bukan PR ini.
* **`RESUME_MAX_PER_USER` belum pernah diuji pada nilai produksi selain bawaannya.** Test
  memakai 1, 2, 5, 7, dan 9 — cukup untuk membuktikan angkanya datang dari config, bukan
  untuk membuktikan perilaku pada 50.

### Next steps

* **PR-061** — Editor CV FE, konsumen pertama seluruh kontrak di sini. Prefill dari profil
  (PR-038/040) adalah pemetaan langsung: bentuk entri CV sengaja dibuat cerminan sub-entitas
  karier, dikurangi `id`.
* **PR-062** — `core/storage` (R2/MinIO), dependensi render PDF.
* **PR-063** — Template + processor PDF. Membaca `content` lewat `resumes.service`, BUKAN
  lewat repository sendiri — modul yang membaca CV dengan caranya sendiri adalah modul yang
  batas lima-CV-nya tidak berlaku.
* **PR-064** — Endpoint enqueue/status + tombol unduh; mengisi `pdfUrl` yang hari ini selalu
  `null`.
* **PR-066/067** — CV dari percakapan AI: memanggil `resumes.service.create(..., "ai_chat")`
  dan mengekstraksi ke `resumeContentSchema` yang sama.

---

## PR-061 — Resume Editor FE

> **Phase:** [09 - Resume Builder & PDF](../phase-09-resume-builder-pdf.md#pr-061---resume-editor-fe)
> **Tanggal:** 2026-09-25
> **Status:** Selesai

### Ringkasan hasil

Editor CV manual tersedia di `/cv` dan `/cv/:id`. Pengguna dapat membuat CV dari salinan profil,
mengubah semua bagian `resumeContentSchema`, menambah/menghapus entri berulang, serta mengatur urutan
dengan tombol atas/bawah. Setiap bagian memakai formulir dan penyimpanan terpisah; kegagalan satu
bagian mempertahankan draf dan tidak menghanguskan bagian lain.

### Scope selesai

* Typed API client untuk list/detail/create/update/delete CV beserta query key yang dilindungi `sub`.
* Mapper prefill paralel dari akun, profil aman, pengalaman, pendidikan, dan keahlian. Mapper tidak
  membaca atau menyalin data disabilitas/akomodasi.
* Daftar CV, pembuatan manual dari profil, penghapusan, dan editor section-based yang responsif.
* Seluruh bagian kontrak: judul, headline/ringkasan, kontak+tautan, pengalaman, pendidikan,
  keahlian, sertifikasi/pelatihan, dan organisasi/kerelawanan.
* Reorder tanpa drag, nama aksi spesifik per item, dan pengumuman posisi baru lewat `role=status`.
* Validasi zod per kolom sebelum request, pesan API sederhana, status loading/error/empty, serta
  katalog `id` dan `id-simple` yang dimuat malas bersama route.
* Unit/API/component test, axe, fixture Playwright, E2E keyboard reorder dan overflow 320 px, serta
  [checklist NVDA](./pr-061-nvda-checklist.md).

### Keputusan teknis

| Keputusan | Alasan |
|---|---|
| Draf dan snapshot tersimpan dipisah | PUT mengganti dokumen utuh. Saat satu bagian disimpan, payload dibangun dari snapshot server dengan hanya bagian itu diganti, sehingga perubahan belum disimpan di bagian lain tidak ikut terkirim. |
| Satu mutasi isi berjalan pada satu waktu | Mencegah dua PUT dokumen utuh saling menimpa; tombol simpan lain dinonaktifkan sampai jawaban diterima. |
| `<details>/<summary>` untuk bagian kolaps | Perilaku keyboard dan semantik buka/tutup tersedia secara natif tanpa state/ARIA kustom. |
| Tombol reorder, bukan drag | Bisa dipakai keyboard-only dan screen reader; urutan array tetap menjadi urutan render/PDF. |
| Prefill membuat salinan | Perubahan CV tidak mengubah profil dan perubahan profil berikutnya tidak mengubah CV yang sudah dibuat. |

### Risiko dan next steps

* Checklist NVDA masih perlu ditandatangani secara manual pada lingkungan Windows + NVDA saat review.
* Unduh PDF tetap di luar scope dan dilanjutkan PR-064.
