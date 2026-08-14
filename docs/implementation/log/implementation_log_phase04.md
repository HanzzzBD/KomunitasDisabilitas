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
