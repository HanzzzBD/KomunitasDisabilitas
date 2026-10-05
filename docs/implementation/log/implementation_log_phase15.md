# Implementation Log — Phase 15 (Mobile Android)

> Catatan per PR yang selesai di Phase 15. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-088 — Expo Bootstrap + EAS

> **Phase:** [15 - Mobile (Android)](../phase-15-mobile-android.md#pr-088---expo-bootstrap--eas)
> **Tanggal:** 2026-10-04
> **Status:** Selesai (AC build EAS & device fisik menunggu verifikasi owner — U-35)
> **Branch:** `pr-088-expo-bootstrap` → `phase-15-mobile-android` (branch phase dibuat dari `main` sesudah `phase-14 → main`, PR #204)

### Ringkasan hasil

`apps/mobile` berubah dari placeholder menjadi shell Android Expo yang bisa di-bundle dan di-build:
entry `index.ts` → `App` (SafeAreaProvider + NavigationContainer + native stack, satu layar
`Beranda`), wrapper refresh token di atas SecureStore, validasi deep link `nawasena://`, klien API
dari `@nawasena/api-client`, `app.config.ts`, `eas.json` profil `internal`, dan smoke Maestro.

### Keputusan owner (2026-10-04)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Expo SDK | **57** (RN 0.86.3, React 19.2.3) | SDK 52 (terakhir React 18) sudah usang dan target API-nya akan ditolak Play Store. Mobile memakai React 19 sendiri; web tetap 18.3 — pnpm memisahkannya per workspace. |
| applicationId / skema | **`id.nawasena.app`** / **`nawasena://`** | Permanen setelah rilis Play Store. |
| EAS | **Disiapkan owner** | `projectId` dari env `EAS_PROJECT_ID`, tidak di repo. |
| URL API build internal | **Environment EAS `preview`, wajib HTTPS** | Staging belum ada (Phase 16). Tanpa nilai, `app.config.ts` menghentikan build di mesin EAS — bukan APK yang crash di HP. |
| Runner test | **Vitest + adaptor disuntik** | Seragam dengan seluruh repo; render komponen RN baru dibutuhkan di PR-089. |

### Keputusan teknis

* **SecureStore saja, lewat adaptor.** `token-storage.ts` murni (diuji Vitest);
  `secure-store-adapter.ts` satu-satunya pengimpor `expo-secure-store`
  (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Token kosong/berspasi di tepi/> 2048 karakter ditolak sebelum
  menyentuh store. Keystore yang tidak bisa didekripsi (mis. kunci layar diganti) dibaca sebagai
  "belum login" dan sisanya dibuang. `android.allowBackup: false`.
* **Deep link tervalidasi.** `filter` React Navigation memakai `deepLinkDiizinkan`: skema harus
  `nawasena://`, path cocok `[a-z0-9-]` per segmen (tanpa `..`, `%`, `@`, `:`), ≤ 512 karakter, dan
  ada di `PATH_DIIZINKAN`. Tautan lain diabaikan — app tetap di layar awal. Parsing manual karena
  `URL` di RN tidak lengkap untuk skema kustom. Test menjaga skema di `app.config.ts` sama dengan
  validator.
* **Paket bersama tanpa patch.** `@nawasena/schemas`/`api-client` memakai impor relatif `.js` gaya
  NodeNext yang menunjuk berkas `.ts`; Metro tidak memetakannya (dibuktikan: tanpa resolver,
  bundle gagal `Unable to resolve module ./client.js`). Resolver kecil di `metro.config.js`
  mencoba ulang tanpa `.js`. Konfigurasi aplikasi, bukan patch paket.
* **Klien API dirakit saat boot** (`import "./api"` di `App.tsx`) agar URL yang salah gagal cepat.
  `apiBaseUrl`: dev tanpa nilai → `http://10.0.2.2:3000/api/v1`; non-dev wajib HTTPS.
* **Tidak ada script `dev`** — `pnpm dev` root akan menyalakan Metro interaktif. Pakai `start`.
* `react-dom` 19.2.3 sebagai devDependency: peer opsional `expo`/`@expo/cli` yang tanpa ini
  di-auto-install pnpm memakai 18.3.1 milik web (peer mismatch).
* **`pnpm.packageExtensions` untuk `react-router` (root `package.json`).** Begitu mobile membawa
  `@types/react` 19, salinan itulah yang ter-hoist ke `node_modules/.pnpm/node_modules`, dan tipe
  `react-router` (yang tidak mendeklarasikan `@types/react`) di web membacanya: 107 galat
  `TS2786 'Link'/'RouterProvider' cannot be used as a JSX component`. Ekstensi ini menjadikan
  `@types/react` peer opsional `react-router`, sehingga tiap pemakai menyuntikkan versinya sendiri
  (web 18, mobile tidak memakai react-router). Bila galat serupa muncul untuk paket lain sesudah
  menambah dependensi React di mobile, obatnya sama.
* **`packages/a11y` kini mendeklarasikan `react` (peer `^18.3.0 || ^19.0.0`, dev 18.3.1).** Bug
  laten yang terbuka oleh React 19 di workspace: a11y memakai `zustand` (binding React) tanpa
  menyebut `react`, jadi `auto-install-peers` memilih React *apa pun yang ada* — dulu kebetulan 18,
  sesudah mobile masuk menjadi 19.2.3. Web lalu memuat dua React: 60 test web gagal dengan
  `Invalid hook call` / `Cannot read properties of null (reading 'useSyncExternalStore')`.
  Rentang peer sudah mencakup 19 karena SDD §4.2 menyebut logika a11y dipakai mobile (PR-091).
* `android/`, `ios/`, `.expo/`, `expo-env.d.ts` di-gitignore — managed workflow; native dibangun
  di EAS.

### Verifikasi

* `pnpm --filter @nawasena/mobile test` — 33 test hijau (storage 8, deep link 20, config 5).
* `lint` (termasuk `app.config.ts`, `metro.config.js`) + `typecheck` hijau; prettier bersih.
* `expo export --platform android` — **bundle Hermes sukses** (883 modul, 2,3 MB), memuat
  `@nawasena/api-client` + `@nawasena/schemas` (+ zod) apa adanya → AC "platform-agnostic".

### Status Acceptance Criteria

* [ ] Build EAS internal sukses & terinstal di device uji — **owner** (U-35).
* [ ] SecureStore roundtrip token teruji — unit test wrapper hijau; roundtrip di runtime Android
  menunggu APK EAS (U-35).
* [ ] Deep link scheme membuka app — validator teruji; pembukaan app nyata lewat
  `.maestro/boot-smoke.yaml` di APK EAS (U-35).
* [x] `packages/api-client` & `schemas` terpakai tanpa patch (bundle Metro sukses).
* [ ] Boot < 3 dtk di device kelas menengah — **owner, device fisik** (U-35).

### Percobaan build native lokal (gagal karena lingkungan, bukan kode)

Build release lokal (`expo prebuild` + `gradlew assembleRelease`, x86_64) untuk uji emulator
dicoba atas persetujuan owner, lalu dihentikan:

1. Percobaan pertama dihentikan Claude Code karena RAM laptop hampir habis (emulator + Gradle).
2. NDK `27.1.12297006` (default Expo 57) di SDK laptop berupa folder kosong → dipaksa ke NDK 28.2
   yang terpasang, khusus build lokal.
3. `expo-modules-core:configureCMakeRelWithDebInfo` gagal memulai `prefab_command.bat`: path
   store pnpm (`node_modules/.pnpm/expo-modules-core@57.0.20_react-native@0.86.3_…`) ± 250
   karakter. `LongPathsEnabled=1` sudah aktif, tetapi cmd.exe/CMake tetap terbatas MAX_PATH.

EAS membangun di Linux sehingga tidak terkena (3). Bila build lokal Windows kelak dibutuhkan
(mis. debugging native), jalankan dari path pendek (`subst`) atau pakai WSL. Folder `android/`
hasil prebuild sudah dibuang (gitignored).

### Risiko & catatan

* Expo SDK 57 + React 19 berbeda dari web (React 18). Hook bersama yang kelak dipindah ke paket
  shared harus kompatibel keduanya; `@types/react` ikut terpisah per workspace.
* Maestro belum di CI (butuh emulator di runner) — dijalankan manual.
* TalkBack smoke shell belum dilakukan; komponen aksesibel + lint label baru lahir di PR-089.

### Next steps

* PR-089: `packages/ui/native` + lint `accessibilityLabel` wajib.
* Owner: `eas init`, isi `EXPO_PUBLIC_API_URL` di environment `preview`, `build:internal`, uji di HP.

---

## PR-089 — packages/ui-native + Lint A11y Label

> **Phase:** [15 - Mobile (Android)](../phase-15-mobile-android.md#pr-089---packagesui-native--lint-a11y-label)
> **Tanggal:** 2026-10-04
> **Status:** Selesai (checklist TalkBack di device menunggu owner — U-35)
> **Branch:** `pr-089-ui-native` → `phase-15-mobile-android`

### Ringkasan hasil

Paket baru `@nawasena/ui-native` berisi empat komponen RN yang membaca token a11y: `Tombol`,
`Masukan`, `Kartu`, dan `Dialog`, ditambah `PenyediaTokenA11y`/`useTokenA11y` dan
`tokenNativeDari`. Preset ESLint baru `@nawasena/config/eslint/react-native` menolak elemen
interaktif RN tanpa `accessibilityLabel` (dan tanpa `accessibilityRole` untuk yang bisa ditekan).
`apps/mobile` memakai preset itu dan dibungkus `PenyediaTokenA11y`. Beranda kini mengambil warna
dan ukuran huruf dari token.

### Keputusan owner (2026-10-04)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Lokasi | **`packages/ui-native`** (bukan `packages/ui/native` seperti tertulis di doc) | `packages/ui` adalah web (React 18, Radix, peer `^18`, test jsdom). Satu paket tidak bisa punya devDependency React 18 dan 19 sekaligus. Paket sejajar cocok dengan glob `packages/*`. |
| Test render RN | **jest-expo + @testing-library/react-native 14** | Merender RN sungguhan (preset Android). Jest hanya hidup di paket native; workspace lain tetap Vitest. |

### Keputusan teknis

* **Lint label lewat `no-restricted-syntax`, bukan plugin kustom.** Selektornya:
  `JSXOpeningElement[name.name=/^(Pressable|Touchable…|TextInput|Switch)$/]:not(:has(> JSXAttribute[name.name="accessibilityLabel"]))`.
  Kombinator `>` di dalam `:has` penting. Tanpanya, label milik elemen lain di dalam render prop
  ikut dihitung (fixture menguji kasus ini). Batasnya: label yang datang lewat spread tidak
  terlihat, jadi label wajib ditulis eksplisit.
* **`eslint-plugin-jsx-a11y` tidak dipakai di preset RN.** Plugin itu membaca elemen DOM; di
  RN ia diam, dan gerbang yang tampak menyala padahal kosong lebih buruk daripada tidak ada.
* **`TARGET_SENTUH` (44/56) pindah ke inti `@nawasena/a11y`.** `TARGET_SENTUH_PX` web kini
  merujuknya, sehingga web dan mobile membaca satu sumber. Satuannya px CSS di web dan dp di
  Android; keduanya independen-kepadatan.
* **Token native berupa data, bukan kaskade.** `tokenNativeDari(preferensi)` menghasilkan
  `skalaTeks`, `targetSentuh`, `kurangiGerak`, `kontrasTinggi`, dan palet. Palet normal selaras
  dengan varian Tombol web; palet kontras tinggi hitam-putih murni. Rasio WCAG dihitung di test,
  tidak hanya ditulis di komentar.
* **Skala teks preferensi ditumpuk di atas skala huruf OS** (RN tetap `allowFontScaling`). Ini
  menghormati setelan Android, sama seperti zoom browser dan preferensi di web.
* **Label = teks terlihat** pada Tombol (WCAG 2.5.3). Teks di dalam tombol diberi
  `importantForAccessibility="no"` agar tidak dibaca dua kali.
* **Masukan**: label terlihat selalu ada (placeholder tidak cukup). Galat ditampilkan sebagai live
  region `polite` dan juga ikut di `accessibilityHint` kolom. Galat ditandai garis lebih tebal +
  teks, bukan warna saja (WCAG 1.4.1).
* **Kartu** adalah union bertipe: versi dapat ditekan *wajib* `label` (TalkBack meringkas isinya
  menjadi satu nama); versi statis membiarkan isinya terbaca satu per satu.
* **Dialog** dibangun di atas `Modal`. Fokus masuk ke judul lewat `onShow` dengan
  `sendAccessibilityEvent(…, "focus")`. Fokus keluar ke `pemicu` hanya pada transisi terbuka →
  tertutup, bukan saat render awal. Tombol Kembali memanggil `tutup`. Profil "kurangi gerak"
  mematikan animasi.
* **jest + pnpm:** `transformIgnorePatterns` menoleransi segmen `.pnpm/<pkg>/node_modules/`, dan
  `moduleNameMapper` memetakan impor `.js` NodeNext → `.ts`, hanya `.js` persis. Versi awal
  yang kehilangan backslash (heredoc) ikut memetakan `.cjs` milik zod-openapi.
  `test-renderer` dipin 1.2.0 karena 1.3.0 menuntut React ≥ 19.3.
* `packages/ui-native/package.json` ikut disalin di kedua Dockerfile, supaya daftar manifest
  workspace tetap lengkap.

### Verifikasi

* `@nawasena/ui-native`: 22 test jest hijau (token 5, komponen 11, dialog 6).
* `@nawasena/config`: fixture lint RN menghasilkan 7 galat (4 label, 3 role) dan 0 galat pada
  fixture sah.
* `@nawasena/a11y` 76 test hijau sesudah konstanta dipindah.
* `apps/mobile`: lint (preset RN), typecheck, test 33 hijau. `expo export --platform android`
  sukses (898 modul) dengan `ui-native` + `a11y` ikut ter-bundle.

### Status Acceptance Criteria

* [x] Komponen interaktif tanpa label → lint error (fixture).
* [x] Target sentuh mengikuti token (44→56dp) — unit test.
* [ ] TalkBack membaca role+label benar — role/label teruji di unit test; ucapan nyata menunggu
  [checklist TalkBack](pr-089-talkback-checklist.md) di device (U-35).
* [x] Token a11y (font scale dsb.) diterapkan — unit test (skala teks, target, kurangi gerak,
  palet kontras).
* [ ] Dialog: fokus aksesibilitas pindah masuk/keluar benar — event fokus teruji di unit test;
  perpindahan nyata menunggu checklist di device (U-35).

### Risiko & catatan

* Perilaku TalkBack antar-versi Android: checklist ditulis untuk dua versi.
* `sendAccessibilityEvent` saat `onShow` di Android kadang terlalu cepat untuk TalkBack. Bila
  checklist menunjukkan fokus tidak berpindah, beri jeda satu frame di sana (bukan di test).
* Store preferensi belum tersambung: `apps/mobile` memakai `ACCESSIBILITY_DEFAULTS` sampai PR-091.

### Next steps

* PR-090: login OTP + Google (pemakai pertama Tombol, Masukan, dan Dialog).

---

## PR-090 — Mobile Auth

> **Phase:** [15 - Mobile (Android)](../phase-15-mobile-android.md#pr-090---mobile-auth)
> **Tanggal:** 2026-10-05
> **Status:** Implementasi selesai; AC runtime menunggu build EAS + device (U-35)
> **Branch:** `pr-090-mobile-auth` → `phase-15-mobile-android`

### Ringkasan hasil

Android kini punya pintu masuk setara web. **OTP**: layar nomor HP → layar kode (hint autofill
SMS) → sesi. **Google**: Android Credential Manager lewat modul Kotlin lokal → Google ID token →
endpoint baru `POST /auth/google/mobile` yang memverifikasi token dan mengonsumsi nonce terbitan
server. **Sesi**: store Zustand (access token di memori), refresh token di SecureStore, boot
memulihkan sesi, 401 → refresh single-flight milik api-client, dan stack navigasi berganti
seluruhnya menurut status sesi (guarded stack). Beranda mendapat tombol Keluar ber-Dialog.

### Keputusan owner (2026-10-05)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Google di Android | **Credential Manager + ID token** (bukan Custom Tab/PKCE) | Login terasa native. Google menolak redirect skema kustom untuk client Web, dan skema kustom di client Android baru dimatikan bawaan. Aturan "PKCE wajib" direvisi: wajib untuk authorization-code flow (web); Android memakai ID token + nonce. |
| Implementasi native | **Expo module lokal** (`apps/mobile/modules/google-credential`) | Versi Credential Manager `@react-native-google-signin` berbayar; `react-native-credentials-manager` (MIT, 0.9.0) me-`Log.d` email ke logcat dan bergantung pada `androidx.credentials` 1.6.0-alpha02. Modul sendiri: ±60 baris Kotlin, tanpa log, dependensi stabil dipin. |
| Nonce | **Terbitan server, sekali pakai** | Nonce buatan klien tidak menutup replay — pencuri token juga membawa nonce-nya. |
| OTP autofill | **Hint saja** (U-36) | Kanal utama WhatsApp; SMS Retriever hanya menolong fallback SMS dan menuntut ubahan teks SMS di API. |
| Gerbang U-35 | **Owner menjalankan build EAS sebelum merge** | Pemicu U-35 = sebelum PR-090 di-merge; build itu juga satu-satunya bukti modul Kotlin terkompilasi. |

### Keputusan teknis

* **Backend aditif, verifier yang sama.** id_token Credential Manager ber-`aud` Web Client ID
  (`GOOGLE_CLIENT_ID`), jadi `createGoogleIdTokenVerifier` dipakai ulang; client ID Android
  hanya muncul di `azp`. Verifier mendapat metode `verifyDenganNonce` (antarmuka terpisah,
  `GoogleMobileIdTokenVerifier`) supaya nonce tidak menumpang `GoogleIdentity` ke repository.
* **Langkah find-or-create + sesi + audit diekstrak** (`buatPenyelesai`) dan dipakai web dan
  Android. Aturan penautan akun (PR-020a) tidak bisa menyimpang di antara keduanya.
* **Urutan: tanda tangan dulu, nonce kemudian.** Nonce hanya dipercaya karena Google
  menandatanganinya; mengonsumsinya dari token yang belum terverifikasi berarti siapa pun bisa
  membakar nonce orang lain (diuji: audience salah → 401 dan nonce tetap ada).
* **Konsumsi nonce = `DEL` atomik** (hasil 1 = sah). Dua permintaan bersamaan dengan nonce sama
  → tepat satu 200 (diuji). Redis cache (allkeys-lru): nonce ter-evict = gagal tertutup.
  Disimpan sebagai SHA-256, bukan nilai mentah.
* **Satu jawaban untuk nonce tidak ada / tidak dikenal / terpakai** (`TOKEN_GOOGLE_TIDAK_VALID`),
  diaudit sebagai `AUTH_LOGIN_FAILED` dengan alasan baru `googleNonceInvalid` (anggota enum
  aditif).
* **Modul Kotlin** memakai `GetSignInWithGoogleOption` (alur tombol: pemilih akun selalu
  tampil, tidak diam-diam memilih akun) dan hanya mengembalikan id_token. Kode galat
  `DIBATALKAN`/`TIDAK_ADA_AKUN`/`GAGAL` adalah kontrak dengan `src/auth/google.ts`. Modul
  dimuat dengan `requireOptionalNativeModule`: di Expo Go tombol Google disembunyikan, bukan crash.
* **`.gitignore` mobile dijangkarkan** (`/android/`, `/ios/`). Pola lama `android/` ikut
  mengabaikan `modules/google-credential/android/` — modulnya akan hilang diam-diam dari commit.
* **Store sesi murni** (`zustand/vanilla`, deps disuntik) → diuji Vitest. Boot: tanpa token →
  `keluar`; refresh sah → simpan token rotasi **sebelum** menyatakan `masuk`; ditolak → buang
  token; jaringan gagal → `terputus` tanpa membuang token (sinyal buruk bukan alasan mengulang OTP).
  `masuk()` menolak respons tanpa refresh token (bentuk web) alih-alih membuat sesi yang tidak
  bertahan restart.
* **Guarded stack**: layar Masuk/Verifikasi dan Beranda tidak pernah terdaftar bersamaan, jadi
  Kembali sesudah masuk tidak bisa mencapai layar OTP. `initialRouteName` di linking dihapus
  karena Beranda tidak ada di stack "keluar".
* **Layar**: nomor dinormalisasi dari `08…`/`62…`/`+62 …`; kode dirapikan ke 6 angka (aman untuk
  tempel dari WhatsApp); tidak kirim otomatis saat 6 angka (WCAG 3.2.2); hitung mundur kirim
  ulang bukan live region; galat umum `assertive`.
* `zustand` 5.0.2 ditambahkan ke mobile lewat edit manifest + `pnpm install --offline`.
  `pnpm add` menggantung > 10 menit selama `pnpm dev` berjalan di mesin yang sama.

### Verifikasi

* API: `auth-google-mobile-http.test.ts` 9 test (nonce, sukses tanpa cookie, replay, balapan,
  nonce karangan, tanpa nonce, audience Android, 400, 503) + `rbac-http` diperbarui. Suite API
  1901 hijau / 308 skip (Docker mati lokal — test DB/Redis dijalankan CI).
* api-client 165 (5 baru), schemas 115 + `check:openapi` sinkron, web 819, ui-native 22,
  mobile 64 (31 baru: sesi 11, alur masuk/Google 20).
* `pnpm typecheck` + `pnpm lint` 10/10, `pnpm format:check` bersih.
* `expo-modules-autolinking search -p android` menemukan `google-credential`;
  `expo export --platform android` sukses (bundle Hermes 2,4 MB).
* **Belum**: kompilasi Kotlin (hanya di EAS) dan seluruh AC runtime.

### Status Acceptance Criteria

* [ ] OTP end-to-end di build internal (sender uji) — U-35; `.maestro/masuk-otp.yaml` siap.
* [ ] Google login end-to-end — U-35 (butuh OAuth client Android + SHA-1).
* [ ] SMS/OTP autofill bekerja — hint terpasang; SMS Retriever sengaja tidak (U-36).
* [ ] Alur selesai dengan TalkBack — [checklist](pr-090-talkback-checklist.md), U-35.
* [ ] Sesi bertahan restart app — teruji di unit test store; runtime menunggu APK (U-35).

### Risiko & catatan

* Ukuran PR ± 2.300 baris (> 500), sebagian besar test, dokumentasi, dan `openapi.json`
  hasil generator. Backend tidak dipisah karena endpoint tanpa pemakai tidak bisa diuji
  end-to-end.
* Fragmentasi OEM: Credential Manager di Android ≤ 13 bergantung pada Google Play Services
  (`credentials-play-services-auth`). Checklist meminta dua vendor.
* Akun yang hanya punya Google di HP tetapi email-nya diklaim akun OTP lain tetap 409 (PR-020a)
  — pesannya mengarahkan ke OTP, sama dengan web.

### Next steps

* Owner: build EAS internal + uji (U-35), lalu merge.
* PR-091: onboarding + ThemeProvider a11y mobile (store preferensi menggantikan `ACCESSIBILITY_DEFAULTS`).

---

## Penyiapan merge PR-090 setelah build EAS (2026-10-05)

Owner meminta PR-090 di-merge ke `phase-15-mobile-android`, kemudian branch
PR-091 sampai PR-095 di-rebase. Dua perbaikan build yang sebelumnya tersimpan
di PR-093 dimasukkan lebih dahulu ke PR-090 agar dasar auth dapat dibangun:

* `googleid` dipin ke 1.2.0, versi yang berhasil dikompilasi pada EAS.
* Resolver Metro memakai satu entri CJS zod. APK awal tertutup saat bootstrap
  karena zod-openapi dan schemas memakai dua instance zod (CJS dan ESM).
* Tes resolver yang sudah ada dipindahkan bersama konfigurasinya; cache/build
  Gradle modul lokal tetap di-ignore.

Berkas Kotlin/Gradle dan resolver ini identik dengan yang dipakai build internal
PR-095 `fb6b98bd-fccd-47b1-81aa-9819c0c6ec45` yang selesai 2026-10-05 20:33 WIB.
Build tersebut memuat PR-091..095 juga; bukan build terpisah dari tip PR-090.
Owner dapat membuka APK dan memilih akun Google. OAuth Android baru dilaporkan
sudah didaftarkan; keberhasilan login, OTP, sesi setelah restart, dan TalkBack
belum dikonfirmasi. U-35 tetap terbuka.

Merge menunggu check GitHub `lint-typecheck-test` dan `a11y` hijau. Rebase berikutnya
mempertahankan dependensi antarcabang dan seluruh perubahan lokal yang belum
di-commit. Branch phase tidak didorong langsung dan `main` tidak diubah.

---

## PR-091 — Mobile Onboarding + ThemeProvider A11y

> **Phase:** [15 - Mobile (Android)](../phase-15-mobile-android.md#pr-091---mobile-onboarding--themeprovider-a11y)
> **Tanggal:** 2026-10-05
> **Status:** Implementasi selesai; AC runtime menunggu build EAS + device (U-35)
> **Branch:** `pr-091-mobile-onboarding`, ditumpuk di atas `pr-090-mobile-auth` (commit lokal,
> belum di-push — PR-090 menunggu build EAS)

### Ringkasan hasil

Mobile kini memakai profil aksesibilitas yang sama dengan web. `PenyediaTema` menghitung
preferensi efektif lewat `rekonsiliasi(pilihanPengguna, sinyalOS)` dan memberikannya ke token
`@nawasena/ui-native`. Sinyal OS dibaca dari setelan Android (*Hapus animasi*, *Teks kontras
tinggi*) dan diikuti saat app terbuka. Saat masuk, preferensi akun ditarik dan digabung per field
dengan aturan yang sama dengan web. Wizard empat langkah (paritas PR-035) tampil untuk akun yang
belum pernah mengatur apa pun. Saat keluar, preferensi dihapus dari perangkat.

### Keputusan owner (2026-10-05)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Branch | **Commit lokal PR-090 + stack** | PR-090 menunggu build EAS; tidak ada yang masuk remote sebelum owner setuju. |
| Ragam disabilitas | **Paritas web: tidak dikirim** | Mobile tidak boleh lebih jauh dari web di jalur data sensitif. Penyimpanan sungguhan → U-38 (PR-092). |
| i18n | **Teks sederhana langsung** | Mobile belum punya katalog; `simpleLanguage` tersinkron tetapi belum mengubah teks (U-37). |
| Kapan wizard tampil | **Penanda perangkat belum ada DAN profil akun kosong** | Pengguna yang sudah mengatur di web tidak ditanya ulang di HP. |

### Keputusan teknis

* **`gabungkanDariServer` dipindah dari `apps/web` ke inti `@nawasena/a11y`** (`sinkron.ts`),
  ditambah `profilBelumDiatur`. Web mengekspor ulang dari `penyedia-a11y.tsx`, jadi 18 test
  sinkron web tetap berjalan tanpa diubah. Dua salinan aturan "server menang per field" akan
  menyimpang di perbaikan berikutnya.
* **Store** = `createA11yStore` dengan AsyncStorage (`@react-native-async-storage/async-storage`
  2.2.0, versi bawaan SDK 57). Penyimpanan yang gagal ditelan: preferensi tetap berlaku sesi ini.
* **`pantauSinyalOS`** murni (sumber disuntik). Gagal baca = `undefined`, bukan `false`. Event yang
  tiba sebelum bacaan awal tidak ditimpa. `isScreenReaderEnabled` sengaja tidak dibaca
  (`screenReaderHint` adalah pernyataan pengguna, paritas web). Ukuran font OS tidak dipetakan:
  RN sudah menerapkannya, dan skala preferensi ditumpuk di atasnya (PR-089).
* **Koordinator** (`zustand/vanilla`, deps disuntik) berlangganan store sesi:
  * keluar → masuk: cuplik pilihan → GET sekali → gabung → putuskan wizard;
  * masuk → keluar: hapus ketujuh pilihan;
  * boot tanpa sesi tidak menghapus apa pun;
  * jawaban GET milik sesi yang sudah keluar dibuang (penghitung generasi).

  Profil gagal diambil → `selesai` tanpa ditandai (tidak menahan pengguna).
* **Wizard** mengirim `pilihanPengguna`, bukan nilai efektif: sakelar yang tidak disentuh tetap
  NULL di akun dan setelan OS tetap berlaku di perangkat lain. Gagal kirim: penanda tetap ditulis,
  galat + "Pilihan Anda tetap berlaku di HP ini" + "Lanjutkan saja". Fokus TalkBack pindah ke judul
  langkah hanya saat langkah berganti. Skala teks memakai dua tombol (Perkecil/Perbesar) + nilai
  live region, bukan slider (RN inti tidak punya; sulit bagi motorik terbatas).
* **`KotakCentang` baru di `@nawasena/ui-native`**: seluruh baris jadi area sentuh, role
  `checkbox` + state, ✓ + isian (bukan warna saja), label membungkus di skala besar.
* **Header navigasi + transisi ikut token**: kontras tinggi berlaku di bilah judul; "kurangi
  gerakan" → `animation: "none"`.
* **Rollback**: `EXPO_PUBLIC_ONBOARDING_WIZARD_ENABLED=false` (paritas
  `VITE_ONBOARDING_WIZARD_ENABLED`; bawaan aktif).
* Komentar wizard web masih menyebut "PR-037 belum ada". Alasan itu sudah basi; keadaannya dicatat
  di U-38 dan teks kedua platform diubah bersamaan saat disambungkan.

### Verifikasi

* mobile 88 test (24 baru: sinyal OS 5, koordinator/keputusan/mesin langkah 19); a11y 81 (+3);
  ui-native 25 (+3 KotakCentang); web 819 (termasuk 18 sinkron lewat ekspor ulang).
* `pnpm typecheck` + `pnpm lint` 10/10, `format:check` bersih.
* `expo export --platform android` sukses (2,4 MB). Bundel awal web 109,3 / 200 KB (`cek:budget`).

### Status Acceptance Criteria

* [ ] Preferensi web tercermin di mobile pasca-login (dan sebaliknya). Penggabungan + PUT teruji
  di unit test; runtime → checklist #19–20 (U-35).
* [ ] Setting OS dihormati bila user belum eksplisit. Rekonsiliasi + pemetaan teruji; runtime →
  checklist #12–15.
* [ ] Preview live paritas web. Kendali menulis store yang sama dengan `PenyediaTema`; runtime → #6–7.
* [ ] Wizard selesai dengan TalkBack. [Checklist](pr-091-talkback-checklist.md) + `.maestro/onboarding.yaml`.
* [ ] Font scale OS ekstrem (200%) tidak memecah layar inti. Semua layar ScrollView + flexWrap;
  runtime → #16–18.

### Risiko & catatan

* Preferensi akun ditarik SEKALI per masuk (paritas web). Perubahan di perangkat lain baru
  terlihat pada masuk berikutnya.
* Skala preferensi 200% di atas font OS 200% = 4× ukuran dasar. Layar menggulir, tetapi kalau
  checklist #16–18 menunjukkan kerusakan, opsinya `maxFontSizeMultiplier` per elemen.
* Ukuran PR ± 1.400 baris (> 500), terbesar test dan dokumentasi.

### Next steps

* Owner: build EAS + uji PR-090/091 (U-35). Lalu urutannya: push + merge PR-090, rebase PR-091 ke
  `phase-15-mobile-android`, push + merge.
* PR-092: profil & CV mobile (termasuk U-38 untuk mobile).

---

## PR-092 — Mobile Profile + CV Manual

> **Phase:** [15 - Mobile (Android)](../phase-15-mobile-android.md#pr-092---mobile-profile--cv-manual)
> **Tanggal:** 2026-10-05
> **Status:** Implementasi selesai; AC runtime menunggu build EAS + device (U-35)
> **Branch:** `pr-092-mobile-profil-cv`, ditumpuk di atas `pr-091-mobile-onboarding` (commit lokal,
> belum di-push)

### Ringkasan hasil

Seeker kini bisa mengisi profil lengkap dan membuat CV dari Android tanpa web:
* tab bawah Beranda · Profil · CV;
* lima bagian profil, masing-masing dengan tombol simpan sendiri: data dasar, disabilitas &
  akomodasi (consent beri/cabut), pengalaman, pendidikan, keahlian;
* daftar CV dengan "Buat CV dari profil" dan hapus;
* editor CV: judul + tujuh bagian, satu bagian per layar, urutan item lewat tombol Naik/Turun;
* PDF: buat → status → buka di aplikasi PDF HP.

Logika formulir web dipindah ke paket baru **`@nawasena/formulir`** dan dipakai kedua platform.

### Keputusan owner (2026-10-05)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Logika form | **Paket bersama `@nawasena/formulir`** | Satu aturan consent/pemetaan/urutan untuk web dan mobile ("reuse hooks shared" di checklist). |
| Navigasi | **Tab bawah** | Satu ketukan ke tiap area; PR-093+ menambah Lowongan/Lamaran. |
| PDF | **Unduh → aplikasi PDF** | Tetap di dalam alur app, viewer native terbaca TalkBack, bisa disimpan/dibagikan. |

### Keputusan teknis

* **`@nawasena/formulir`** (murni, tanpa React/DOM):
  * helper teks, galat per kolom + `periksa`;
  * pemetaan profil dasar/sensitif + `BADAN_CABUT` + `alihkan`;
  * `pindahItem`/`ubahItem`/`hapusItem`;
  * `buatPrefillResume`;
  * definisi kolom item CV.

  Label kolom datang dari pemanggil (`LabelResume`): web memberi `t` (katalog i18n), mobile memberi
  teks sederhana. Kuncinya kunci katalog web, jadi typecheck web menolak kunci yang tidak ada.
  Berkas web lama kini mengekspor ulang dari paket, jadi 819 test web berjalan tanpa diubah.
* **Dua varian "teks atau null" dipertahankan dengan sengaja.** `teksAtauNull` merapikan (untuk
  simpan formulir). `teksMentahAtauNull` tidak merapikan (untuk editor CV yang menulis per ketukan;
  versi yang merapikan memakan spasi di ujung kata). Web dulu punya dua fungsi bernama sama dengan
  perilaku berbeda; kini namanya berbeda.
* **TanStack Query di mobile tanpa persister.** Profil memuat data disabilitas, jadi tidak ada
  salinan di disk. `queryClient.clear()` + hapus `cache/cv/` saat keluar (`saatKeluar`).
* **Simpan per bagian** (paritas PR-040). Bagian CV menyimpan isi utuh dengan dasar versi server
  TERKINI (GET tepat sebelum PUT), jadi menyimpan "Keahlian" tidak menimpa "Pengalaman" dengan
  salinan basi dari layar lain. Galat zod berawalan `content.` dipetakan ke nama kolom.
* **Validasi klien = skema server.** Karier memeriksa dengan skema *create* (bentuk penuh) sebelum
  POST/PUT, jadi galat per kolom tampil tanpa perjalanan jaringan.
* **Tanggal = kolom teks YYYY-MM-DD** (paritas web, yang menolak pemilih tanggal bawaan).
* **Komponen baru `ui-native`**:
  * `PilihanTunggal` (radio; semua opsi terlihat, "2 dari 3" terbaca);
  * `Masukan` mendapat `multiline` + `maxLength`.
* **Tombol bernama lengkap**: "Hapus pengalaman: Desainer", "Naikkan keahlian 2". Hasil
  pindah/hapus/tambah diumumkan lewat live region.
* **PDF** (`src/cv/pdf.ts`, platform disuntik):
  * status diambil ULANG tepat sebelum membuka, karena URL presigned berumur pendek;
  * unduhan ke nama stabil per CV (menimpa), lalu `getContentUriAsync`, lalu `ACTION_VIEW` dengan
    `FLAG_GRANT_READ_URI_PERMISSION`;
  * tanpa aplikasi PDF: lembar Bagikan;
  * polling status hanya selama antre/diproses.
* **Dependensi baru mobile**: `@tanstack/react-query` 5.62.11 (sama dengan web),
  `@react-navigation/bottom-tabs` 7.20.0, `expo-file-system` 57.0.7, `expo-intent-launcher` 57.0.1,
  `expo-sharing` 57.0.22 (versi bawaan SDK 57). `packages/formulir/package.json` ikut disalin di
  kedua Dockerfile.
* Deep link `nawasena://beranda` tetap berlaku (kini `Utama > Beranda`).
* **Out of scope dicatat**: chat AI CV di mobile (roadmap segera pasca-RC; teks layar CV
  menyebut web sebagai jalurnya).

### Verifikasi

* Test: mobile 100 (12 baru: karier, PDF, bagian CV), formulir 13 (baru), ui-native 27 (+2),
  web 819 (tanpa perubahan test, refactor lewat ekspor ulang), a11y 81.
* `pnpm typecheck` + `pnpm lint` 11/11, `format:check` bersih. `expo export` sukses (2,8 MB).
  Bundel awal web 109,3 / 200 KB.

### Status Acceptance Criteria

* [ ] Profil + CV lengkap dibuat dari mobile — alur lengkap di `.maestro/profil-cv.yaml` (U-35).
* [x] Reorder via tombol (tanpa drag-only) — `pindahItem` teruji; tidak ada gesture seret di app.
* [ ] Consent paritas (beri & cabut) — logika sama dengan web (paket bersama, teruji); runtime
  → checklist #7–12.
* [ ] TalkBack checklist form multi-bagian lulus — [checklist](pr-092-talkback-checklist.md).
* [ ] Unduh PDF CV bekerja (buka viewer) — alur + cadangan teruji; viewer nyata → #21–24.

### Risiko & catatan

* Ukuran PR ± 3.000 baris (> 500). Paket + refactor web, layar mobile, test, dan dokumentasi
  saling bergantung; memisahnya akan menghasilkan paket tanpa pemakai mobile.
* U-38 diperbarui: ragam disabilitas kini bisa disimpan dari profil mobile; yang tersisa hanya
  wizard di kedua platform.
* Editor CV menyunting item secara inline (paritas web). Dengan puluhan item, layar bagian jadi
  panjang; bila checklist menunjukkan ini berat, pecah ke layar per item.

### Next steps

* Owner: build EAS + uji PR-090..092 (U-35), lalu merge berurutan.
* PR-093: feed matching + detail lowongan mobile (tab Lowongan).

---

## PR-093 — Mobile Feed + Job Detail

> **Phase:** [15 - Mobile (Android)](../phase-15-mobile-android.md#pr-093---mobile-feed--job-detail)
> **Tanggal:** 2026-10-05
> **Status:** Implementasi selesai; AC runtime menunggu build EAS + device (U-35)
> **Branch:** `pr-093-mobile-feed`, ditumpuk di atas `pr-092-mobile-profil-cv` (commit lokal,
> belum di-push)

### Ringkasan hasil

Discovery utama kini ada di HP:
* **Beranda = feed AI Job Matching**: kartu skor + alasan, banner "AI sedang menyusun" dan
  banner degradasi, muat ulang + perbarui rekomendasi berkuota, muat lebih banyak;
* **tab Cari** (browse + filter);
* **detail lowongan**: ringkasan, deskripsi/persyaratan dengan "Sederhanakan", dukungan, terbuka
  untuk, blok perusahaan + status verifikasi.

Logika murni discovery web dipindah ke paket baru **`@nawasena/lowongan`**.

### Keputusan owner (2026-10-05)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Tab | **Beranda = feed, tab Cari** | Paritas web (beranda seeker = feed); Beranda · Cari · Profil · CV. |
| Sederhanakan (PR-087) | **Ikut** | Penting bagi pengguna autisme/teks sederhana, terlebih mobile belum punya varian `id-simple` (U-37). |
| Logika feed | **Paket baru `@nawasena/lowongan`** | Nama sesuai isi; satu ambang skor untuk dua platform. |

### Keputusan teknis

* **`@nawasena/lowongan`** (murni):
  * `tingkatKecocokan`/`persenSkor` (ambang 0,7/0,55);
  * `kalimatGaji` + `formatRupiah`;
  * `NilaiFilterLowongan` + `keOpsiPencarian` + `jumlahFilterAktif` + `ke/dariParamPencarian`;
  * kunci taksonomi (tipe, mode, tingkat, gaji) dengan `LabelLowongan` diinjeksi.

  Web mengekspor ulang dari paket; 819 test web (termasuk `gaji.test.ts`, `filter-url.test.ts`)
  tidak diubah.
* **Kartu satu kesatuan** (AC): `Kartu` pressable dengan label kalimat utuh dari `labelKartu`;
  "persen" ditulis kata supaya dibaca sama di semua TTS. Satu komponen untuk feed dan pencarian.
* **Tidak ada yang berubah sendiri** (paritas keputusan owner 2026-09-30): `aiMenyusun` hanya
  memunculkan banner + "Lihat urutan yang baru".
* **Refresh**: tarik-untuk-muat-ulang (GET) selalu berpasangan dengan tombol "Muat ulang daftar"
  (AC). "Perbarui rekomendasi" (POST berkuota) dipisah supaya tarikan tak sengaja tidak
  menghabiskan jatah. Saat jatah habis tombolnya nonaktif, tetapi alasannya tetap terbaca.
* **Posisi daftar pulih** tanpa kode khusus: detail didorong ke stack root di atas tab, jadi
  FlatList feed/cari tidak pernah dilepas.
* **Filter diterapkan saat "Cari"** (WCAG 3.2.2), panel bisa dibuka-tutup
  (`accessibilityState.expanded` + jumlah filter aktif). Jumlah hasil halaman pertama diumumkan
  per perubahan filter.
* **Sederhanakan**: satu tombol berganti label, hasil disimpan di state (tidak meminta ulang),
  degradasi = tombol hilang + penjelasan sesuai `alasan`.
* **Keluar pindah ke tab Profil** (`TombolKeluar`). Beranda lama jadi cadangan bila
  `EXPO_PUBLIC_MATCHING_FEED_ENABLED=false` (paritas `VITE_MATCHING_FEED_ENABLED`).
* Label akomodasi & ragam mobile dipusatkan di `src/profil/label.ts`.
* **Maestro dibetulkan.**
  * `boot-smoke.yaml` (PR-088) masih mengharapkan Beranda tanpa sesi, padahal sejak PR-090 app
    membuka layar Masuk. Kekeliruan ini terlewat di PR-090.
  * Alur lain kini memakai `layar-feed`, dan tombol Keluar dicari di tab Profil.
  * `masuk-otp.yaml` diberi prasyarat akun yang sudah melewati onboarding.

### Verifikasi

* Test: mobile 107 (7 baru), lowongan 8 (baru), web 819 (tanpa perubahan), config 27.
* `pnpm typecheck` + `pnpm lint` 12/12, `format:check` bersih. `expo export` sukses (2,8 MB).
  Bundel awal web 109,4 / 200 KB.

### Status Acceptance Criteria

* [ ] Feed + filter + detail end-to-end — `.maestro/feed-detail.yaml` (U-35).
* [ ] Kartu satu kesatuan bagi TalkBack — `labelKartu` teruji; ucapan nyata → checklist #1.
* [ ] Degraded banner paritas — kondisi + teks paritas web; runtime → #4–5.
* [x] Refresh alternatif tombol (bukan pull-to-refresh saja) — tombol "Muat ulang daftar"
  memanggil fungsi yang sama dengan `RefreshControl`.
* [ ] Kembali dari detail memulihkan posisi list — oleh struktur navigasi; runtime → #3, #15.

### Risiko & catatan

* Ukuran PR ± 1.500 baris (> 500), sebagian test, dokumentasi, dan checklist.
* `Intl.NumberFormat` mata uang di Hermes Android bergantung ICU perangkat; bila gaji tampil tanpa
  format di checklist #18, ganti ke pemformat manual di `@nawasena/lowongan`.
* Deep link ke detail lowongan belum ada (push deep link = PR-094).

### Next steps

* Owner: build EAS + uji PR-090..093 (U-35), lalu merge berurutan.
* PR-094: lamar + tracking + push deep link mobile (tab Lamaran).

---

## Temuan build EAS internal pertama (2026-10-05)

> Build EAS pertama untuk tumpukan PR-090..093 **berhasil dikompilasi**, termasuk modul Kotlin
> `google-credential`, tetapi APK **tertutup paksa saat dibuka** (Samsung, Android 16).

### Diagnosis

1. `adb logcat -b crash` menunjukkan error JS saat bundle dimuat:
   `[runtime not ready]: TypeError: undefined is not a function`, posisi bytecode `1:195097`.
2. Bundle yang sama dibangun ulang lokal (`expo export --source-maps`). Posisi stack dipetakan
   lewat `.hbc.map` menjadi rantai utuh `index.ts → App.tsx → ui-native → a11y/store.ts →
   schemas/index.ts → schemas/common.ts:14`, yaitu panggilan `.openapi(...)` pertama.
3. Daftar sumber bundle memuat **dua zod**. `zod-openapi/dist/extend.cjs` memasang `.openapi()` ke
   `zod/lib/index.js` (CJS). `@nawasena/schemas` diresolusi Metro ke `zod/lib/index.mjs` (ESM),
   kelas `ZodType` lain yang tidak pernah dipasangi.

Bug ini laten sejak PR-088: Vite (ESM untuk keduanya) dan Vitest/Node (konsisten) tidak pernah
memicunya. Dugaan awal "dua React" diperiksa dan **salah**, karena bundle hanya memuat React 19.2.3.

### Perbaikan

* `metro.config.js`: setiap `import "zod"` dipaksa ke satu berkas, yaitu entri yang dipilih Node
  untuk `@nawasena/schemas` (`lib/index.js`). Ini konfigurasi resolver aplikasi, jadi paket bersama
  tetap tidak di-patch (aturan PR-088).
* Penjaga: `apps/mobile/__tests__/metro-config.test.ts` (semua asal → satu berkas zod; impor lain
  tidak dibelokkan). Pindai ulang bundle: satu entri zod, tidak ada paket lain yang menyumbang
  `.cjs` dan `.mjs` sekaligus.
* `googleid` diturunkan ke **1.2.0** oleh owner, karena build EAS gagal terus dengan 1.2.1. Dicatat
  di `build.gradle`.
* `.gitignore` mobile menutup `modules/*/android/.gradle/` + `build/` (cache ekstensi Gradle VS
  Code). `app.json` liar di root (hasil `eas init` dari folder yang salah) dihapus.
* Catatan operasional: `EXPO_PUBLIC_API_URL` wajib diakhiri `/api/v1`. Nilai awal tanpa akhiran
  itu akan membuat setiap panggilan API 404.

### Status

Menunggu build EAS kedua + uji ulang di HP (U-35).
