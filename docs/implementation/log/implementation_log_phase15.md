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
