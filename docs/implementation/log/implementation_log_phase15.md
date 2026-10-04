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
