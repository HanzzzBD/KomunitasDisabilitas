# Implementation Log — Phase 04 (Accessibility Experience)

> Catatan per PR yang selesai di Phase 04. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---
## PR-034 — Accessibility Module (Backend): GET/PUT /me/accessibility + baris bawaan saat registrasi

> **Phase:** [04 - Accessibility Experience](../phase-04-accessibility-experience.md#pr-034---accessibility-module-backend)
> **Tanggal:** 2026-08-14
> **Status:** Selesai

### Ringkasan hasil

Preferensi aksesibilitas berhenti menjadi setelan perangkat. Modul `accessibility` lahir di `apps/api` dengan dua endpoint (`GET`/`PUT /api/v1/me/accessibility`), dan akun yang baru dibuat — lewat OTP maupun Google — mendapat baris preferensi bawaannya sendiri lewat event domain `auth.user_registered` yang juga lahir di PR ini.

Ini juga PR pertama yang menghidupkan **bus event domain di dalam proses API**. Sebelum ini `createEventBus` hanya dipanggil di `apps/worker`; penerbit dan pelanggan `auth.user_registered` sama-sama hidup di proses API (keduanya jalur permintaan HTTP), sehingga proses API butuh instance-nya sendiri.

Tidak ada migrasi database: tabel `accessibility_profiles` sudah berdiri sejak PR-009 dan tidak disentuh sama sekali.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm --filter @nawasena/api test` 59 berkas / 732 test lulus (40 test baru di PR ini).

### Scope selesai

* **`apps/api/src/modules/accessibility/`** — modul baru, mengikuti `routers → controllers → services → repositories` seperti `modules/users`:
  * `repositories/accessibility.repository.ts` — `findByUserId` (select eksplisit tujuh kolom) dan `upsertByUserId`.
  * `services/accessibility.service.ts` — `getMe`, `updateMe`, `provisionDefaults`.
  * `controllers/accessibility.controller.ts` — orkestrasi tipis, identitas dari `authOf(req)`.
  * `routers/index.ts` — dua route, keduanya `access.authenticated()`; `PUT` divalidasi `updateAccessibilityPreferencesSchema`.
  * `index.ts` — factory modul + **satu** panggilan `events.on("auth.user_registered", …)`.
* **`packages/schemas/src/auth.ts`** — `userRegisteredEventSchema` / `UserRegisteredEvent` (`{ userId, registeredAt }`).
* **`apps/api/src/core/events/index.ts`** — entri `"auth.user_registered"` pada peta `DomainEvents`.
* **`apps/api/src/modules/auth/`** — `AuthModuleDeps`, `OtpServiceDeps`, `GoogleServiceDeps` masing-masing menerima `events: EventBus`; satu baris `if (user.isNew) events.emit(...)` di `otp.service.ts verify()` dan `google.service.ts login()`.
* **`apps/api/src/boot.ts`** — `const events = createEventBus({ logger })`, diteruskan ke modul `auth` (penerbit) dan modul `accessibility` (pelanggan) — instance yang SAMA.
* **Test (40 baru)** — `accessibility.test.ts` (14 unit service), `accessibility-http.test.ts` (26 integration HTTP), plus delapan test regresi baru di `auth-otp.test.ts` dan `auth-google-exchange.test.ts` yang menjaga "terbit tepat sekali saat akun baru, tidak terbit saat masuk biasa".
* **`apps/api/__tests__/helpers/events.ts`** — helper `busUji()` untuk berkas test yang memasang `createAuthModule` tetapi tidak sedang menguji event.

### Keputusan teknis

* **D1 — tidak ada sub-folder `subscribers/`.** Langganan ini dua baris, dan logikanya tetap di service. Sisi penerbit (`modules/jobs/services/expiry.service.ts`) sudah memanggil `events.emit(...)` langsung dari dalam service tanpa abstraksi "publisher"; sisi pelanggan dibuat simetris. Abstraksi pendaftaran-pelanggan yang generik untuk satu pelanggan adalah struktur tanpa isi.
* **D2 — kontrak event tinggal di domain penerbitnya** (`packages/schemas/src/auth.ts`), mengikuti presedan `jobClosedEventSchema` di `jobs.ts`. Payload-nya minimal dan **bebas PII**: nomor HP dan email tidak ikut, sama seperti entitas audit `auth.otp`/`auth.google`. Sengaja tanpa `.openapi({ ref })` — ini event domain, bukan kontrak HTTP.
* **D3 — `events` sebagai dependensi konstruktor biasa,** bukan panggilan `subscribe(bus)` terpisah dari `boot.ts`. Satu idiom DI untuk seluruh repo, sama dengan `createJobExpiryService({ …, events })`. Kembalian `events.on(...)` (pembatal langganan) sengaja tidak disimpan: langganannya hidup selama proses.
* **D4 / A-2 — `GET` MENAMBAL DI MEMORI, BUKAN MENULIS DIAM-DIAM. Ini keputusan sadar, bukan kelalaian.** Pengguna tanpa baris mendapat `ACCESSIBILITY_DEFAULTS` (200), dan tidak ada baris yang lahir sebagai efek samping pembacaan. Alasannya tiga: (a) bawaannya konstanta statis, jadi hasilnya identik dengan baris yang baru disediakan — pengguna tidak pernah melihat dua tampilan berbeda; (b) `PUT` adalah satu-satunya endpoint dengan tanggung jawab tulis, dan pengguna yang tidak pernah memilih preferensi memang tidak punya apa pun untuk disimpan; (c) `GET` yang menulis akan berlomba dengan pelanggan event atas kunci primer yang sama — bisa diselesaikan, tetapi hanya dengan mekanisme upsert idempoten yang sudah dipunyai `PUT`, sehingga yang didapat cuma cabang tulis tambahan di jalur baca tanpa satu pun perbedaan perilaku.
  * **Catatan untuk PR berikutnya:** fitur mana pun yang kelak membaca `accessibility_profiles` langsung (raw SQL / join, melewati modul ini) TIDAK BOLEH menganggap barisnya selalu ada. Lewat service modul ini, atau tambal sendiri dengan `ACCESSIBILITY_DEFAULTS`.
* **A-4 — TIDAK ada `AUDIT_ACTION` baru untuk perubahan preferensi. Juga keputusan sadar.** Ticket PR-034 sendiri menyatakan data ini **bukan** data sensitif (bandingkan `ACCOUNT_EMAIL_CHANGED`, yang memang relevan-keamanan). Menambah entri katalog untuk setiap penyimpanan panel preferensi justru menenggelamkan jejak yang seharusnya jarang. `auditLog` tetap ada di `AccessibilityModuleDeps` demi kesamaan bentuk dengan modul lain, dan sengaja tidak dipanggil — alasannya ditulis di tempatnya.
* **`upsert()` Prisma, bukan "coba update lalu create".** `AccessibilityProfile.userId` adalah `@id`, jadi Prisma men-generate `.upsert()` untuk model ini. Satu statement, tanpa jendela baca-lalu-tulis. Ini mengoreksi asumsi audit (risiko #5) yang mengira `.upsert()` tidak tersedia.
* **`events` WAJIB, bukan opsional,** pada ketiga interface deps auth. Setiap pemanggil nyata (`boot.ts`) selalu punya satu; field opsional hanya akan mengubah "lupa memasangnya" menjadi kegagalan tanpa gejala — akun baru yang tidak pernah mendapat baris preferensi, tanpa satu pun error. Biayanya: tujuh call site di berkas test ikut diperbarui (lihat Risiko).
* **`access.authenticated()`, bukan `access.self()`.** Alasannya sama persis dengan `modules/users`: tidak ada param `:userId` untuk dibandingkan, dan `requireSelf` menolak SEMUA permintaan pada route tanpa param (perilaku sengaja dari PR-019). Isolasi antar pengguna di sini bersifat **struktural** — tidak ada saluran input untuk menyebut pengguna lain sama sekali.
* **D6 — batas PR & disiplin scope (C-7).** Perubahan di `otp.service.ts`/`google.service.ts` persis sebatas satu field wajib baru (`events: EventBus`) dan satu baris `if (user.isNew) events.emit(...)` per berkas, ditaruh di titik yang sudah dicapai kode (`user.isNew` sudah dihitung dua baris sebelum panggilan `auditLog(...)` yang sudah ada). Tidak ada percabangan baru di luar `isNew`, tidak ada refactor modul `auth`. Modul `accessibility` tidak pernah mengimpor `modules/auth/repositories/*` atau `modules/auth/services/*` — satu-satunya yang menyeberangi batas modul adalah tipe `EventBus` dari `core/events`, dan hanya `boot.ts` (composition root) merujuk kedua modul sekaligus.

### Verifikasi

* **Test penyediaan awal memeriksa ISI TABEL, bukan response `GET`.** Ini bukan detail: `GET` menjawab bawaan pada pengguna tanpa baris SEKALIPUN penyediaan tidak pernah berjalan (D4), jadi test yang hanya memeriksa response akan lulus di kedua keadaan — termasuk saat langganannya diam-diam putus. Yang diperiksa adalah baris di Prisma palsu setelah `events.emit(...)` dan antrean microtask terkuras.
* **Emit diuji dari dua sisi:** terbit tepat sekali dengan `{ userId, registeredAt }` pada akun baru, dan **tidak terbit sama sekali** saat akun lama masuk lagi, saat kode OTP salah, dan saat penukaran code Google gagal.
* **Payload event diuji bebas PII** di kedua jalur (nomor HP di OTP, email/nama di Google).
* **Batas `textScale` diuji di KEDUA sisi:** 99 dan 201 ditolak, 100 dan 200 diterima (batas atas 200 berasal dari WCAG 2.2 §1.4.4).
* **`.strict()` diuji sebagai penolakan, bukan pembuangan diam-diam:** `{ userId: B, textScale: 120 }` dari token A → 400, dan baris B benar-benar tidak berubah.
* **Kegagalan pelanggan diuji** dengan repository yang menolak: `emit()` tidak melempar, dan kegagalannya sampai ke `logger.error` — masuk tidak pernah gagal karena baris preferensi.

### Risiko yang ditemukan

* **Perubahan dependensi wajib menyentuh tujuh call site test, bukan dua.** Rencana memperkirakan `auth-otp.test.ts` dan `auth-google-exchange.test.ts` (yang memanggil `createOtpService`/`createGoogleService` langsung). Kenyataannya lima berkas lain memanggil `createAuthModule` (`auth-account-http`, `auth-google-http`, `auth-otp-http`, `auth-session-http`, `rbac-http`) dan ikut merah di `typecheck`. Sudah diperbaiki di PR ini lewat helper `busUji()`. Ini justru bukti bahwa memilih `events` sebagai field WAJIB berjalan seperti yang diinginkan: yang lupa dipasang gagal saat kompilasi, bukan saat produksi.
* **Jendela balapan penyediaan awal ADA — dan itu memang desainnya, bukan bug.** Antara `emit()` dan pelanggan benar-benar berjalan, `GET /me/accessibility` bisa dipanggil dan akan menjawab bawaan dari memori. Bagi penguji yang tidak membaca D4, ini tampak seperti penyediaan yang gagal diam-diam. **Cara membedakannya:** periksa isi tabel, bukan response — keduanya terlihat identik dari luar. Jangan "memperbaikinya" dengan membuat `provisionDefaults` sinkron atau menunggu emit di jalur masuk: itu melanggar kontrak fire-and-forget bus dan tidak mengubah apa pun yang dilihat pengguna.
* **D5 — Dua instance `EventBus` hidup di repo ini** (`apps/worker/src/index.ts` dan `apps/api/src/boot.ts`). **Bukan bug:** `createEventBus` menutup `Map` baru setiap dipanggil — tidak ada singleton, port, atau registry proses yang disentuh, dan entri baru pada `DomainEvents` bersifat aditif (tidak mengubah `"job.closed"` yang sudah ada, worker tetap kompilasi & jalan tanpa perubahan). Dicatat di sini supaya tidak "ditemukan kembali" sebagai kecurigaan kelak. Baris lognya tetap bisa dibedakan lewat `service: "api"` vs `service: "worker"` dari logger masing-masing proses.
* **`ACCESSIBILITY_DEFAULTS` bisa menyimpang seiring waktu** (belum diselesaikan PR ini): bila nilainya diubah setelah sebagian pengguna punya baris tersimpan, pengguna tanpa baris akan melihat bawaan BARU sementara pengguna yang sudah disediakan tetap memegang bawaan LAMA sampai `PUT` berikutnya. PR mana pun yang kelak mengubah konstanta itu perlu mempertimbangkan backfill.
* ~~**`docs/implementation/phase-04-accessibility-experience.md` menyebut "(SDD §6.2)"** untuk mekanisme event. SDD §6.2 sebenarnya tentang enkripsi AES-256-GCM `disability_types`/`accommodation_needs`; katalog event ada di **SDD §15**.~~ Rujukan yang basi — dilaporkan, tidak diam-diam diperbaiki di PR ini. **Dikoreksi di tahap dokumentasi (2026-08-15):** rujukan diperbaiki menjadi `SDD §15` di baris Objective PR-034.
* ~~**SDD §15 tidak mencantumkan `accessibility` sebagai konsumen `auth.user_registered`** (hanya `notifications` dan `admin`).~~ Higiene dokumentasi, bukan syarat kode. **Dikoreksi di tahap dokumentasi (2026-08-15):** `SDD.md` §15 sekarang mencantumkan `accessibility (default preferences row, PR-034)` pada baris `auth.user_registered`.
* **Test `apps/web` sesekali merah saat `pnpm test` seluruh workspace dijalankan bersamaan** (`findByRole` habis waktu di `router.test.tsx` dan tetangganya). Berjalan sendiri, `pnpm --filter @nawasena/web test` lulus 408/408. Tidak berkaitan dengan PR ini — PR ini tidak menyentuh satu pun berkas di `apps/web`, `packages/ui`, atau `packages/a11y`. Dicatat sebagai kerentanan waktu di harness FE, bukan regresi.

### Next steps

* **PR-035** — onboarding aksesibilitas: konsumen pertama endpoint ini.
* **PR-036** — panel preferensi + jaminan sinkron lintas perangkat.
* ~~Angkat dua koreksi dokumentasi (rujukan SDD §6.2 pada ticket PR-034; daftar konsumen di SDD §15) ke pemilik dokumen.~~ Selesai di tahap dokumentasi PR-034 (lihat Risiko).

---
## PR-035 — Onboarding Wizard Aksesibilitas (FE): wizard 4-langkah, preview live, consent terpisah

> **Phase:** [04 - Accessibility Experience](../phase-04-accessibility-experience.md#pr-035---onboarding-wizard-aksesibilitas-fe)
> **Tanggal:** 2026-08-16
> **Status:** Selesai (QC PASS iterasi 2, 16/16 AC terpenuhi)

### Ringkasan hasil

Momen pertama produk yang membuktikan janji "100% aksesibel": wizard 4-langkah (ragam disabilitas → persetujuan → preferensi tampilan → ringkasan) yang bisa **dilewati di langkah mana pun** dan setiap perubahan preferensi terlihat **hidup** di layar sebelum apa pun disimpan — konsumen pertama `GET`/`PUT /me/accessibility` dari PR-034. Ragam disabilitas TIDAK PERNAH dikirim ke jaringan pada PR ini (endpoint PR-037 belum ada) — dibuktikan sampai ke sumbernya (state lokal tanpa penulis), bukan hanya diasersikan lewat test.

Rute `/onboarding` di-*lazy-load*, dijaga oleh sakelar build-time (bawaan AKTIF, dicek dua kali di `routes/onboarding.tsx` dan `tata-letak.tsx`) dan oleh penanda selesai per-pengguna (`nawasena-onboarding-selesai:{sub}`, `sub` dibaca dari token JWT di memori — tidak diverifikasi, sengaja, karena hanya menggerbangi prompt yang bisa dilewati, bukan otorisasi). QC menemukan **dua cacat pemblokir** pada iterasi pertama, keduanya diperbaiki dan diverifikasi ulang oleh QC di iterasi kedua (lihat Keputusan teknis).

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 (`@nawasena/web` 38 berkas / **479** test), `pnpm --filter @nawasena/web test:a11y` **30 lulus** (Chromium nyata, build produksi, termasuk 4 pemeriksaan axe per-langkah + 5 test E2E onboarding), `pnpm --filter @nawasena/web build` (chunk baru `onboarding-*.js` 10,18 kB / 3,00 kB gzip).

### Scope selesai

* **`apps/web/src/features/onboarding/`** — modul baru: `wizard.tsx` (orkestrator + mutasi `PUT`), `mesin-langkah.ts` (reducer `useReducer`, batas langkah 0–3), `identitas.ts` (penanda selesai per-pengguna + fallback sesi), `bendera.ts` (sakelar build-time), `kotak-centang.tsx` (checkbox app-lokal — `packages/ui` tidak punya satu pun), `pesan-galat.ts` (pembungkus tipis `galat-api.ts`), empat komponen langkah (`langkah-ragam-disabilitas.tsx`, `langkah-persetujuan.tsx`, `langkah-preferensi.tsx`, `langkah-ringkasan.tsx`).
* **`apps/web/src/routes/onboarding.tsx`** — rute lazy, membungkus diri sendiri dengan `<Terlindungi>`; `routes.ts` tetap berkas data tanpa guard.
* **`apps/web/src/app/tata-letak.tsx`** — pemicu pengalihan ke `/onboarding` untuk pengguna masuk yang belum punya penanda, dengan daftar jalur dikecualikan eksplisit (`/masuk`, `/masuk/google`, dll).
* **`apps/web/src/app/penyedia-a11y.tsx`** — context + hook `useA11yStoreWeb()` baru sehingga komponen turunan (termasuk `Wizard`) bisa mengambil store yang sama tanpa prop-drilling; celah nyata yang ditemukan plan (klaim arsitektur "consumed as-is" ternyata salah).
* **`packages/api-client/src/endpoints/accessibility.ts`** + `index.ts` — modul endpoint baru mengikuti pola `endpoints/users.ts`.
* **`packages/schemas/src/accessibility.ts`** — `accessibilityResponseSchema` (amplop `{data: ...}`) yang sebelumnya tidak ada — tanpa ini setiap panggilan nyata akan gagal `RESPONS_TIDAK_DIKENAL`.
* **`apps/web/src/shared/i18n/katalog/onboarding.ts`** (55 kunci, `id` + `id-simple`), didaftarkan di `katalog/index.ts`.
* **Test baru** — `onboarding.test.tsx`, `onboarding-identitas.test.ts`, `onboarding-mesin-langkah.test.ts`, `packages/api-client/__tests__/accessibility.test.ts`, plus pembaruan `tata-letak.test.tsx`, `penyedia-a11y.test.tsx`, `katalog-kelengkapan.test.ts`, `schemas.test.ts`.
* **`apps/web/e2e/onboarding.spec.ts`** (5 test) + entri baru di `e2e/halaman.ts` (axe per langkah) + override lokal `/auth/refresh` di `e2e/palsukan-api.ts`.
* **Dokumen manual** — `docs/implementation/log/pr-035-tab-order.md` (urutan Tab lengkap per langkah) dan `pr-035-nvda-checklist.md` (instrumen uji NVDA — lihat Risiko).

### Keputusan teknis

* **D1 — tiga modul di luar rencana di `features/onboarding/`, semuanya dipertahankan.** `bendera.ts` menyatukan pembacaan `import.meta.env` yang rencana tulis dua kali (risiko salah ketik nama variabel); `kotak-centang.tsx` dibangun app-lokal karena `packages/ui` benar-benar tidak punya checkbox dan onboarding adalah satu-satunya konsumen (anti-abstraksi-prematur, presedan yang sama dipakai untuk stepper); `pesan-galat.ts` memakai ulang `shared/galat-api.ts` yang sudah ada.
* **D2 — `Wizard` menerima `store`/`klien`/`onKeluar` sebagai prop; tidak memanggil hook router/DOM sendiri.** Rencana menaruh pemanggilan hook di dalam `wizard.tsx`; diangkat ke `routes/onboarding.tsx` karena `features/README.md` menyatakan `features/` adalah lapisan yang dipakai ulang mobile dan **tidak boleh** bergantung pada router web atau DOM secara langsung — batasan nyata di repo yang terlewat oleh rencana. Perilaku identik; instans store yang sama dibuktikan lewat test kesetaraan referensi.
* **D3 — kegagalan simpan TIDAK memicu navigasi otomatis ke beranda.** Rencana meminta "tandai selesai lalu tetap navigasi". Yang diimplementasikan: penanda tetap ditulis segera, `role="alert"` dirender, tombol "Simpan dan mulai" **diganti** menjadi "Lanjutkan ke beranda", pengguna pergi atas kehendaknya sendiri. Alasan: navigasi pada tick yang sama akan melepas komponen sebelum `role="alert"`-nya sempat merender satu frame pun — pesan yang "ditampilkan" tapi tidak pernah dilihat/didengar siapa pun, yang akan membuat klaim AC nomor 4 (galat BI muncul) benar hanya di atas kertas.
* **D4 — perbaikan bug di luar rencana: fokus judul langkah pada saat *mount*.** `useEffect` fokus berjalan saat komponen pertama kali dipasang, bukan hanya saat langkah benar-benar berganti, sehingga tombol "Lompat ke konten utama" tidak pernah bisa menjadi target Tab pertama di `/onboarding`. Ditemukan oleh penjaga E2E yang sudah ada (`lompat-ke-konten.spec.ts`), diperbaiki dengan membandingkan langkah **berdasarkan nilai**, dan sekarang dijaga permanen di test yang sama.
* **D5–D8 (ringkas)** — `identitas.ts`/`mesin-langkah.ts` mengekspor sedikit lebih banyak dari sketsa rencana (injeksi penyimpanan untuk test, `kunciPenanda()`, `langkahSaatIni()`) tanpa mengubah perilaku; `e2e/onboarding.spec.ts` meng-override `/auth/refresh` secara lokal karena token palsu bawaan bukan JWT valid (mengubah fake bersama akan membuat SETIAP halaman `butuhSesi` ikut dialihkan ke wizard di axe gate); entri log ini sendiri ditulis di tahap dokumentasi, bukan implementasi, sesuai presedan PR-034; langkah "preferensi" sengaja **tidak** diberi live-region tambahan untuk perubahan pratinjau (checkbox native NVDA sudah mengumumkan keadaannya sendiri) — keputusan yang bisa dibalik, dicatat eksplisit di §H1 `pr-035-nvda-checklist.md`.
* **Dua cacat pemblokir dari QC iterasi 1, keduanya diperbaiki dan diverifikasi ulang oleh QC iterasi 2:**
  * **QC-1 (HIGH) — pengguna dengan `localStorage` diblokir/penuh terkunci permanen di `/onboarding`.** `tandaiOnboardingSelesai()` menelan kegagalan tulis; `TataLetak` mengevaluasi ulang `sudahOnboarding(sub)` di setiap navigasi dan selalu mengalihkan balik selama penanda tidak pernah tertulis — "Selesai" maupun "Lewati" sama-sama berulang selamanya. Komentar kode yang salah sebelumnya menyebut konsekuensinya sebagai "wizard tampil lagi pada pemuatan berikutnya" (bukan kunci permanen), dan komentar itulah yang membuat tiga tahap hijau (implementasi, testing, security review) melewatkan cacat ini. **Perbaikan:** `Set<string>` berlingkup modul dan seumur sesi (`penandaSesiBawaan`) di `identitas.ts`, dikonsultasikan **hanya** pada jalur penyimpanan bawaan (bukan yang di-injeksi untuk unit test) — keberhasilan ditentukan eksplisit lewat penanda `tertulis`, bukan sekadar "tidak melempar", karena `bawaan()` bisa mengembalikan `undefined` tanpa melempar sama sekali saat `localStorage` sendiri melempar pada akses properti. Diverifikasi gagal dulu pada kode belum-diperbaiki (4 test merah, mendarat di `/onboarding`), lalu lulus setelah perbaikan.
  * **QC-2 (MEDIUM) — dua string i18n menjanjikan kapabilitas Pengaturan yang belum ada.** `onboarding.galat.tetapBerlaku` dan `onboarding.persetujuan.butir.bisaDicabut` menunjuk ke `/pengaturan/aksesibilitas`, yang masih stub kosong (panelnya baru datang di PR-036). **Perbaikan:** kedua string ditulis ulang tanpa menyebut kapabilitas yang belum ada; kunci consent diganti nama `bisaDicabut` → **`tidakTersimpan`** karena maknanya berubah — bukan lagi "izin ini bisa dicabut", melainkan "izin ini tidak disimpan di mana pun, jadi tidak ada yang perlu dicabut", yang justru lebih meyakinkan di permukaan consent UU PDP.
* **Perubahan roster agent di tengah-run.** `dw-documenter` dan `dw-verifier` dipensiunkan dan digabung menjadi satu agent `dw-closer`; tahap CLOSING sekarang menulis dokumentasi dan verifikasi akhir sekaligus (bukan dua tahap terpisah).

### Verifikasi

* **16/16 kriteria akhir (AC-1..AC-16) terpenuhi**, diverifikasi ulang QC dari sumber kode, bukan dari klaim tahap sebelumnya (lihat `09-qc-2.md`).
* **Klaim negatif PDP (AC-7/AC-8) ditelusuri sampai ke tiap sink** oleh security review: jaringan, `localStorage`/`sessionStorage`/IndexedDB, analytics/error-reporting (tidak ada satu pun di repo), logging, cache React Query, state URL/router, DOM. Hanya field preferensi (7 field, bukan ragam disabilitas) yang pernah dikirim ke `/me/accessibility`.
* **Decode JWT `sub` yang tidak diverifikasi** (`identitas.ts`) — seluruh input cacat (base64 rusak, JSON tidak valid, kosong, mengandung `:`, unicode) diverifikasi hanya menghasilkan `null` atau string tak berbahaya, tidak pernah melempar; hanya dua pemakai di seluruh pohon kode, keduanya menggerbangi prompt yang bisa dilewati, bukan otorisasi.
* **Blast radius pengalihan `TataLetak`** dikonfirmasi lengkap terhadap registry rute nyata, termasuk irisan dengan alur re-auth Google saat hapus akun (`alamatKembali()` mengembalikan jalur yang sama untuk login normal maupun re-auth, jadi satu entri pengecualian sudah cukup).
* **4 test regresi QC-1** terbukti gagal dulu terhadap kode belum-diperbaiki (bukti non-kevakuman), lalu lulus setelah perbaikan; keduanya menembus `Wizard` + `TataLetak` nyata lewat `ruteApp`, memecah `Storage.prototype`/`window.localStorage` sungguhan (bukan tiruan yang di-injeksi).

### Risiko yang ditemukan

* **AC nomor 4 (NVDA) adalah instrumen, bukan hasil.** `pr-035-nvda-checklist.md` lengkap dan siap dipakai, tetapi **belum pernah dijalankan** — butuh Windows + NVDA + telinga manusia, tidak bisa dijalankan dari pipeline ini. PR ini TIDAK boleh disebut "terverifikasi NVDA" sampai seseorang benar-benar menjalankan checklist-nya dan mengisi kolom Hasil.
* **Penanda selesai tidak reaktif lintas tab.** Pengguna yang menyelesaikan wizard di tab A tidak membuat tab B (yang masih memegang render pra-selesai) ikut berubah; tab B baru mengecek ulang pada render/navigasi berikutnya sendiri. Diterima sesuai cakupan per-perangkat/per-tab yang memang menjadi desain AC nomor 9.
* **Fallback sesi QC-1 juga berlingkup per-tab.** Dengan `localStorage` mati, tab kedua punya `Set` kosongnya sendiri dan akan menampilkan wizard sekali lagi di tab itu — konsisten dengan desain, tapi terlihat oleh pengguna dan perlu dicatat di sini agar tidak "ditemukan kembali" sebagai bug.
* **Pemulihan sesi QC-1 mengandalkan "tidak melempar" sebagai bukti tertulis (`tertulis = tujuan !== undefined`).** Secara teori, implementasi `localStorage` yang menerima tulisan lalu langsung membuangnya dalam sesi yang sama akan membuka kembali kuncian ini — tidak diketahui ada peramban nyata yang berperilaku begini (mode privat justru melempar, sudah tercakup). Bila suatu saat perlu diperkeras, bentuk yang lebih aman adalah menambahkan ke `Set` tanpa syarat pada jalur bawaan — **belum dikerjakan, di luar cakupan PR ini.**
* **Belum ada test untuk isolasi lintas-pengguna khusus fallback QC-1** (pengguna A selesai dengan storage mati, keluar, pengguna B masuk di tab yang sama, B tetap harus melihat wizard). Kode menjaminnya lewat konstruksi (Set dikunci per `sub`) tetapi tidak ada satu test pun yang menjepitnya — risiko dinilai rendah, dicatat sebagai celah, bukan cacat.
* **Ketegangan ringan antar dua string consent.** `onboarding.ringkasan.setuju` (tidak diubah) masih berbunyi "Anda mengizinkan kami memakai data ini kelak", sementara butir consent yang direvisi (`tidakTersimpan`) menyatakan izin tidak disimpan di mana pun dan lenyap begitu wizard ditinggalkan. Keduanya benar secara terpisah, tapi kata "kelak" bisa dibaca pembaca yang teliti sebagai izin yang terbawa — layak ditinjau ulang saat PR-037 benar-benar menyimpan consent.
* **Salinan consent PR-035 akan perlu ditinjau ulang saat PR-036.** Copy saat ini sengaja menyatakan "tidak ada yang tersimpan, tidak ada kontrol pencabutan" (perbaikan QC-2). Begitu PR-036 mengirim panel Pengaturan sungguhan, pernyataan itu menjadi tidak akurat dan perlu direvisi bersamaan dengan PR-036, bukan sebelumnya.
* **`pnpm format:check` gagal repo-wide pada 80 berkas** — pra-eksisting, bukan gate CI (`pr.yml` tidak menjalankannya), tidak berkaitan dengan PR-035; setiap berkas yang PR-035 buat/ubah lulus `prettier --check` sendiri-sendiri.

### Next steps

* **PR-036** — panel preferensi permanen di Pengaturan. Harus dibangun DI ATAS salinan consent PR-035 yang sudah direvisi (lihat Risiko), bukan mendahuluinya — inilah alasan PR-036 sengaja ditahan sampai PR-035 selesai (commit → push → PR → CI → merge).
* Jalankan `pr-035-nvda-checklist.md` dengan NVDA + Windows sungguhan sebelum mengklaim AC nomor 4 sebagai hasil, bukan sekadar instrumen — pelaksanaannya di luar cakupan agen ini.
* Pertimbangkan menutup celah non-pemblokir di atas (isolasi lintas-pengguna fallback QC-1; pengerasan `tertulis`) sebagai pekerjaan kecil terpisah, bukan bagian PR-035.

---

## PR-036 — Panel Preferensi Aksesibilitas + Sinkron Lintas Perangkat (FE)

> **Phase:** [04 - Accessibility Experience](../phase-04-accessibility-experience.md#pr-036---preferences-panel--sinkron-lintas-perangkat)
> **Tanggal:** 2026-08-20
> **Status:** Selesai (QC PASS pada re-run, 8/8 AC terpenuhi — 3 dengan catatan; lihat Verifikasi)

### Ringkasan hasil

Panel permanen di `/pengaturan/aksesibilitas` menggantikan stub `KeadaanKosong` 38 baris: tujuh kontrol (6 sakelar + slider `textScale`) dengan autosave per-field (PUT diantrekan, bukan fire-and-forget) dan tombol reset. `SambungkanServer` (baru, di `penyedia-a11y.tsx`) mengambil `GET /me/accessibility` sekali per login dan menggabungkannya ke store lokal — field yang sedang diedit saat respons tiba tetap menang. Tautan navigasi persisten ke panel ditambahkan ke shell (khusus pengguna masuk).

Rencana awal salah premis: field server bernilai bawaan (`ACCESSIBILITY_DEFAULTS`) diperlakukan sebagai "pilihan terkonfirmasi akun", padahal `accessibility/index.ts:51` menyediakan baris berisi nilai bawaan itu untuk **setiap** pengguna baru tanpa mereka memilih apa pun — server tidak pernah bisa menyatakan "belum pernah memilih". Diterapkan sesuai rencana, ini akan mematikan diam-diam akomodasi `prefers-reduced-motion`/`prefers-contrast` OS setiap pengguna yang tidak pernah menyentuh sakelar, tepat saat login. Cacat ini tertangkap **saat implementasi** (bukan lolos ke produksi), dikembalikan ke tahap desain, dan diperbaiki dengan aturan 3-cabang `gabungkanFieldOS()` (lihat Keputusan teknis). QC kemudian menemukan dan memblokir cacat kedua — race merge-on-refetch — yang diperbaiki dengan menjalankan merge sekali per login. Kedua perbaikan diverifikasi ulang oleh QC dan lulus.

Gate hijau (verifikasi akhir orkestrator): `pnpm lint` 9/9, `npx tsc --noEmit` (langsung, apps/web) exit 0, `pnpm test` — `@nawasena/web` 40 berkas / **516** test (naik dari 479 di awal PR, lewat 508 → 512 → 514 → 516 antar tahap), `pnpm --filter @nawasena/web build` OK, `cek:budget` 110,7 KB / 200,0 KB LOLOS, `npx playwright test --workers=2` 42 lulus.

### Scope selesai

* **`packages/ui/src/kotak-centang.tsx`** — `KotakCentang` dipromosikan dari onboarding (PR-035) ke `@nawasena/ui`; PR-036 adalah konsumen kedua yang direncanakan headernya sendiri.
* **`apps/web/src/features/aksesibilitas-panel/`** (baru) — `panel.tsx` (7 kontrol, autosave per-field, reset), `index.ts`.
* **`apps/web/src/app/penyedia-a11y.tsx`** — `SambungkanServer` (fetch + merge saat login) dan `gabungkanFieldOS()` (penjaga sinyal OS untuk `highContrast`/`reduceMotion`, lihat Keputusan teknis).
* **`apps/web/src/app/{providers.tsx,tata-letak.tsx}`** — pemasangan `SambungkanServer`; tautan shell ke panel.
* **`apps/web/src/routes/pengaturan-aksesibilitas.tsx`** — stub diganti panel nyata.
* **`apps/web/src/shared/i18n/katalog/{pengaturan.ts,shell.ts}`** — kunci baru `pengaturan.aksesibilitas.*` (reset, status simpan, galat, hint "ikut perangkat") + `shell.pintas.*`, `id` + `id-simple`.
* **`apps/web/e2e/`** (baru) — `preferensi-akun.ts`, `pengaturan-sinkron.spec.ts` (AC-1, dua `browser.newContext()`), `aksesibilitas-matriks.spec.ts` (AC-2), `kontras-skala.spec.ts` (AC-3).
* **Test baru/diperluas** — `apps/web/__tests__/{aksesibilitas-panel,sambungkan-server}.test.tsx`, `packages/ui/__tests__/kotak-centang.test.tsx`; 9 test/spec pra-eksisting dipersempit (bukan dilemahkan) agar tetap benar dengan `GET` boot-time baru dari `SambungkanServer`.
* **Dihapus:** `apps/web/src/features/onboarding/kotak-centang.tsx` (dipindah, bukan digandakan).

### Keputusan teknis

* **Cacat desain tertangkap saat implementasi (AC-6/AC-1 vs provisioning server).** Diperbaiki dengan aturan 3-cabang, hanya untuk `highContrast`/`reduceMotion` (5 field lain tetap tulis-tanpa-syarat): (1) nilai server ≠ bawaan → tulis (bukti pilihan eksplisit); (2) nilai server = bawaan **dan** ada sinyal OS hidup yang bertentangan → **field dilewati**, `rekonsiliasi()` jatuh ke tingkat OS; (3) nilai server = bawaan tanpa pertentangan → tulis (menjaga AC-1 tetap sinkron untuk reset-ke-default). Tidak ada perubahan backend/skema/`packages/a11y`; `store.getState().os` dibaca langsung saat merge, bukan snapshot.
* **Dua batas perilaku diterima sadar** (didokumentasikan di JSDoc `gabungkanFieldOS`, "DUA BATAS YANG DITERIMA SADAR"): (a) cabang 3 **mengunci** field — perubahan OS yang terjadi **setelah** login tidak lagi berlaku untuknya, karena alternatifnya (selalu lewati saat server=bawaan) mengorbankan AC-1, fitur utama PR ini; (b) cabang 2 adalah **celah parsial AC-1** — perangkat A mereset `highContrast` true→false tidak akan sampai ke perangkat B yang memegang nilai lokal eksplisit `true` dengan OS yang meminta kontras lebih.
* **Perbaikan QC (race merge-on-refetch, blocking).** `refetchOnReconnect` (bawaan v5, tidak pernah dioverride) + `invalidateQueries()` di `banner-luring.tsx` memicu refetch, dan `queryFn` men-snapshot ulang `awal.current` di **setiap** jalannya query — sehingga edit lokal yang dibuat **sebelum** refetch (PUT-nya belum landing) terklasifikasi "tidak tersentuh" dan tertimpa. Diperbaiki dengan menjalankan merge **sekali per login** (`sudahDigabung` ref, direset saat `status !== "masuk"`), bukan menambah pelacakan PUT tertunda lintas komponen (dilarang eksplisit — akan menautkan panel dan provider yang sengaja independen). **Konsekuensi diterima:** perubahan dari perangkat lain kini baru tampak pada login/reload berikutnya, bukan di tengah sesi — ini justru yang diminta AC-1 sendiri (E2E-nya me-reload perangkat B, bukan menunggu di tempat).
* **AC-2 "8 kombinasi utama"** diinterpretasikan sebagai 2³ atas `highContrast` × `reduceMotion` × `simpleLanguage`, dicakup di halaman panel — tidak dispesifikasi eksplisit di ticket, direkam sebagai interpretasi.
* **AC-3 diuji pada viewport 640×512** (setara 1280px pada zoom 200%), bukan 320px — pada 320px + `textScale:200`, hal pertama yang pecah adalah `<h1>` PR-033a (lihat Risiko), bukan panel ini.
* **AC-4 reset** memanggil `hapusPilihan()` pada ketujuh kunci lalu PUT `efektif()` (bukan menulis nilai bawaan hardcoded), sehingga sinyal OS bisa kembali muncul setelah reset alih-alih dipaksa mati.

### Verifikasi

* **8/8 AC terpenuhi**, 3 dengan catatan yang harus dibaca bersama klaimnya: AC-1 (sinkron di login/reload berikutnya, bukan mid-sesi; celah parsial cabang 2 di atas), AC-2 (interpretasi 2³, lingkup halaman panel), AC-3 (diuji 640×512, bukan 320px).
* **AC-1** — `e2e/pengaturan-sinkron.spec.ts`, dua `browser.newContext()` sungguhan (localStorage terpisah), PUT/GET diperiksa dua arah.
* **AC-2** — `e2e/aksesibilitas-matriks.spec.ts`, axe atas 8 kombinasi + penjaga anti-kevakuman (kombinasi benar-benar berbeda).
* **AC-3** — `e2e/kontras-skala.spec.ts`, axe + asersi overflow pada 640×512.
* **AC-4** — unit + E2E; ditutup dua celah nyata di tahap testing (body PUT reset harus persis `ACCESSIBILITY_DEFAULTS`; PUT reset harus mengantre di belakang PUT sakelar lain yang sedang berjalan, bukan menyalipnya).
* **AC-5** — `tata-letak.test.tsx`: tautan tampak dari rute mana pun, 1 klik, urutan Tab benar, tersembunyi saat belum masuk.
* Lighthouse (bagian job CI `a11y`: a11y=100, perf≥80, plus lintasan mobile-3G) **tidak dijalankan lokal oleh tahap mana pun** di PR ini; `lighthouserc.json` hanya mengaudit `index.html`, jadi halaman panel baru tidak diaudit langsung. Risiko sisa dinilai rendah (budget bundle 110,7/200 KB) tapi **tidak terverifikasi lokal** — jangan diklaim lulus.
* Tidak ada verifikasi NVDA/manual assistive-technology untuk panel ini pada PR ini.

### Risiko yang ditemukan (follow-up, bukan bagian PR-036)

* **Perbaikan sesungguhnya untuk premis yang salah** ada di PR-034: field preferensi perlu bisa bernilai "belum diatur" (nullable), bukan selalu punya nilai bawaan konkret. Sampai itu ada, kedua batas yang diterima sadar di atas tidak bisa ditutup — perubahan backend, di luar cakupan PR-036.
* **Cache query TanStack tidak berlingkup pengguna** (`accessibilityKeys.me()`), dan `keluar()` di `sesi/store.ts` tidak membersihkan cache. Ironisnya, komentar pada key itu sendiri menyatakan alasan tidak menyertakan parameter adalah mencegah "cache berisi preferensi orang lain dalam satu sesi peramban" — padahal satu key yang dipakai bersama oleh semua pengguna justru TIDAK mencegah itu.
* **`pilihanPengguna` bertahan di `localStorage` lintas logout**, sehingga perangkat bersama membawa preferensi pengguna sebelumnya. Ini **pra-eksisting** (wizard PR-035 sudah menulis ke situ); PR-036 memperlebar sumber datanya, bukan celahnya — jangan diatribusikan ke PR-036.
* `penyedia-a11y.tsx` masih men-snapshot ulang `awal.current` pada setiap **retry** sebelum merge pertama terjadi, sehingga edit yang dibuat selagi GET awal sedang retry/pending bisa terbaca "tidak tersentuh". Jendelanya sempit — detik-detik pertama login, saat "server menang di login" memang hasil yang dispesifikasi.
* `<h1>` "Pengaturan" (PR-033a) meluap horizontal pada 320px dengan `textScale:200` (`scrollWidth` terukur 341 vs 320) — di luar ambang WCAG mana pun; `break-words` akan menutupnya.
* `langkah-preferensi.tsx` (PR-035) — `<output className="min-w-16">` punya overflow 3px yang sama pada zoom 200% yang diperbaiki di panel ini dengan `shrink-0`.
* Masih terbuka dari PR-035: pengerasan opsional QC-nya (penambahan `Set` tanpa syarat + test isolasi lintas-pengguna), dan checklist manual NVDA yang sudah ada tapi belum pernah dijalankan.

### Next steps

* Buka PR-034 lanjutan untuk field preferensi nullable ("belum diatur") agar kedua batas AC-1/AC-6 yang diterima sadar di atas bisa ditutup permanen.
* Jalankan Lighthouse (a11y + perf + mobile-3G) secara lokal setidaknya sekali untuk halaman panel sebelum mengklaimnya terverifikasi di luar CI.
* Pertimbangkan menutup `<h1>` PR-033a dan `<output>` PR-035 (overflow ringan pada zoom tinggi) sebagai perbaikan kecil terpisah.
* Berlingkup pengguna pada `accessibilityKeys.me()` dan bersihkan query cache saat `keluar()`, sesuai maksud komentar yang sudah ada di kode tapi belum diterapkan.

---
