# @nawasena/mobile

Aplikasi Android Nawasena — Expo SDK 57 (managed), React Navigation, SecureStore
(ADR-011, SDD §4.2). iOS menyusul di Fase 2 produk.

## Menjalankan lokal

```bash
pnpm install
pnpm --filter @nawasena/mobile start      # Metro; tekan `a` untuk emulator Android
pnpm --filter @nawasena/mobile test       # Vitest (logika murni, tanpa runtime RN)
```

Build dev memakai API `http://10.0.2.2:3000/api/v1` (localhost mesin host dilihat
dari emulator). Untuk HP fisik di LAN, isi `EXPO_PUBLIC_API_URL=http://<ip-laptop>:3000/api/v1`.

Sengaja **tidak** ada script `dev`: `pnpm dev` di root menjalankan `dev` semua
workspace, dan Metro interaktif tidak cocok berjalan di dalamnya.

## Build internal (EAS)

Sekali saja, oleh pemilik akun Expo:

```bash
npx eas-cli login
cd apps/mobile && npx eas-cli init          # mencetak projectId
```

`projectId` **tidak** ditulis ke repo; simpan sebagai `EAS_PROJECT_ID` (env lokal
dan environment EAS). Lalu isi `EXPO_PUBLIC_API_URL` (wajib HTTPS) di environment
EAS **preview** — profil `internal` membaca environment itu. Tanpa nilai tersebut
build berhenti di `app.config.ts`, bukan menghasilkan APK yang crash saat dibuka.

```bash
EAS_PROJECT_ID=<id> pnpm --filter @nawasena/mobile build:internal
```

Hasilnya APK distribusi internal (tautan unduh dari EAS) untuk device uji.

## Aturan yang berlaku sejak PR-088

- **Refresh token hanya di SecureStore** (`src/storage/`), tidak pernah AsyncStorage.
  `expo-secure-store` hanya diimpor di `secure-store-adapter.ts`.
- **Deep link `nawasena://`** divalidasi `src/navigation/deep-link.ts`: hanya path
  di `PATH_DIIZINKAN` yang diteruskan ke navigator. Layar baru yang boleh dibuka
  dari luar harus ditambahkan di sana **dan** di `linking.ts`.
- **Paket bersama dipakai tanpa patch.** Impor `.js` gaya NodeNext di
  `@nawasena/schemas`/`api-client` dipetakan oleh resolver di `metro.config.js`.
- `EXPO_PUBLIC_*` ikut ter-inline ke APK — publik. Jangan menaruh rahasia di sana.

## Masuk (PR-090)

- **OTP**: nomor HP → kode 6 angka (`autoComplete="sms-otp"` agar autofill Android
  menawarkan kode dari SMS). Sesi: access token di memori (`src/auth/sesi.ts`,
  Zustand), refresh token di SecureStore; boot memulihkan sesi lewat `/auth/refresh`.
- **Google**: Android Credential Manager lewat modul native lokal
  `modules/google-credential` (Kotlin, ditemukan autolinking Expo). **Bukan**
  Custom Tab dan **bukan** redirect `nawasena://`. Alurnya: nonce dari
  `POST /auth/google/mobile/nonce` → pemilih akun → id_token →
  `POST /auth/google/mobile`. PKCE tidak berlaku di jalur ini; anti-replay
  dipegang nonce sekali pakai terbitan server.
- Modul native hanya ada di build EAS (dan dev client) — **tidak** di Expo Go.
  Tanpa modul atau tanpa client ID, tombol Google disembunyikan.

Penyiapan Google Cloud Console (sekali, oleh pemilik proyek GCP):

1. **OAuth client tipe Android**: package `id.nawasena.app` + SHA-1 sertifikat
   penandatangan (`npx eas-cli credentials` → Android → keystore). Satu client per
   sertifikat (internal/EAS, nanti Play App Signing). Client ini tidak dipakai di
   kode — Google memakainya untuk mengizinkan APK kita meminta token.
2. **Web Client ID** yang sama dengan `GOOGLE_CLIENT_ID` API dipakai sebagai
   `serverClientId`: isi `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` di environment EAS
   **preview**. id_token yang dihasilkan ber-`aud` Web Client ID ini, sehingga
   verifier API yang sama menerimanya.

## Smoke test

`.maestro/boot-smoke.yaml` (boot + deep link) dan `.maestro/masuk-otp.yaml`
(OTP dengan sender uji), dijalankan manual:
`maestro test apps/mobile/.maestro/<berkas>.yaml`. Belum di CI.
