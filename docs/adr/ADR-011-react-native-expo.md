# ADR-011 — React Native Expo untuk Mobile Application

Status: Accepted

Tanggal: 2026-07-15

## Context

Nawasena menargetkan web + mobile (PRD §7: Android 8+, iOS 14+). Tim 2–5 orang memakai React di web; aplikasi mobile harus mendukung TalkBack (WCAG 2.2 AA sebagai gate rilis) dan berbagi logika dengan web melalui monorepo Turborepo.

Constraint: timeline MVP 3–4 bulan; pengujian aksesibilitas manual per platform adalah beban terbesar; mayoritas pengguna target memakai Android.

Alternatif yang dipertimbangkan:
1. **Flutter** — satu codebase Dart, tetapi dukungan screen reader Flutter Web lemah dan menambah bahasa kedua di tim React.
2. **Native Kotlin/Swift** — aksesibilitas terbaik per platform, tetapi dua codebase tambahan tidak realistis untuk tim ini.
3. **React Native + Expo** — berbagi bahasa, tooling, dan packages dengan web.

## Decision

Aplikasi mobile Nawasena dibangun dengan **React Native + Expo (managed workflow)**. UI ditulis native React Native (bukan react-native-web) demi kontrol penuh atas perilaku TalkBack/VoiceOver; logika dibagikan dari monorepo (`packages/schemas`, `packages/api-client`, `packages/a11y`). Setiap komponen interaktif WAJIB memiliki `accessibilityLabel` dan `accessibilityRole`; pengujian TalkBack masuk definition-of-done. Distribusi MVP: **Android via EAS Build → Google Play**; iOS menyusul pada Fase 2. Push notification melalui expo-notifications + FCM.

## Consequences

### Positif

* Satu bahasa (TypeScript) dan satu ekosistem untuk seluruh klien → kecepatan tim maksimal.
* Skema validasi, API client, dan logika profil aksesibilitas identik antara web dan mobile — konsistensi perilaku terjamin.
* EAS Build menghilangkan kebutuhan infrastruktur build Android sendiri.

### Negatif

* Menunda iOS berarti pengguna iOS (termasuk pengguna VoiceOver) belum terlayani aplikasi native di MVP.
* Ketergantungan pada layanan Expo (EAS) untuk build dan update.
* Aksesibilitas React Native menuntut kerja eksplisit per komponen — tidak otomatis seperti HTML semantik.

### Mitigasi

* Web SPA responsif + aksesibel tersedia untuk semua platform sejak hari pertama, termasuk pengguna iOS.
* `packages/ui` varian RN menstandarkan props aksesibilitas — komponen tanpa label ditolak lint/review.
* Arsitektur klien tidak bergantung Expo secara permanen; eject/prebuild tetap terbuka bila dibutuhkan.

## Referensi

PRD §7–8; SDD §4.2, §4.3. Terkait: ADR-008, ADR-009, ADR-014.
