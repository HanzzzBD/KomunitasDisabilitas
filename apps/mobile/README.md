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

## Smoke test

`.maestro/boot-smoke.yaml` (boot + deep link), dijalankan manual:
`maestro test apps/mobile/.maestro/boot-smoke.yaml`. Belum di CI.
