# Memeriksa login Google Android

Panduan untuk APK internal PR-095, build
[`fb6b98bd-fccd-47b1-81aa-9819c0c6ec45`](https://expo.dev/accounts/ledwinevalchein/projects/nawasena/builds/fb6b98bd-fccd-47b1-81aa-9819c0c6ec45),
yang selesai pada 2026-10-05. Owner melaporkan bahwa setelah memilih akun,
aplikasi kembali ke layar Masuk tanpa pesan. Penyebab di perangkat belum terbukti.

## 1. Pilih proyek Google OAuth login

Buka [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients)
dan masuk dengan akun yang mengelola proyek login Nawasena. Pilih proyek melalui
pemilih proyek di bagian atas. Cari client **Web application** dengan Client ID:

```text
652484876497-knjbd47iv585d2phc50ms613gp4e95v6.apps.googleusercontent.com
```

Nilai ini sudah diperiksa: sama di backend dan bundle APK tersebut. Proyek
Firebase untuk push Nawasena berbeda dari proyek OAuth login. Daftarkan Android
di proyek yang memiliki Web Client ID di atas.

## 2. Periksa atau buat client Android

Pada halaman **Clients**, periksa client bertipe **Android**. Jika belum ada
client dengan package dan SHA-1 berikut, pilih **Create client → Android**:

| Kolom | Nilai |
| --- | --- |
| Name | `Nawasena Android EAS` |
| Package name | `id.nawasena.app` |
| SHA-1 certificate fingerprint | `E5:FE:DC:EB:18:EB:FE:95:81:D8:13:F9:2B:99:6F:04:70:34:16:06` |

Klik **Create**. SHA-1 ini berasal dari pemeriksaan signature APK internal yang
terpasang, bukan dari debug keystore. Jika client yang cocok sudah ada, lanjut ke
uji login. Client untuk sertifikat lain boleh tetap ada.

Android Client ID tidak perlu dimasukkan ke env aplikasi. Alur Credential Manager
tetap memakai **Web Client ID** yang sudah tertanam. Panduan konfigurasi ini
mengikuti [Google Codelab](https://codelabs.developers.google.com/sign-in-with-google-android).

## 3. Coba APK yang sudah terpasang

1. Pastikan API dan tunnel tetap hidup. Buka
   [readiness API](https://api-dev.orbit4.my.id/readyz); hasil yang diharapkan adalah
   `data.status: "siap"`.
2. Setelah client tersimpan di Google Cloud, tutup Nawasena dari aplikasi terbaru,
   lalu buka lagi dan tekan **Masuk dengan Google**.
3. Pilih akun dan selesaikan layar persetujuan jika muncul.
4. Hasil yang diharapkan: masuk ke wizard akun baru atau halaman aplikasi akun lama.
5. Tutup dan buka lagi; sesi seharusnya dipulihkan.

Pendaftaran client Android di Cloud dapat diuji dengan APK ini karena package,
sertifikat, dan Web Client ID-nya sudah benar. Perubahan pesan login di source
membutuhkan APK baru dan belum termasuk dalam build `fb6b98bd`.

## Jika masih kembali ke layar Masuk

Catat apakah ada pesan Google, apakah layar persetujuan muncul, dan jam percobaan
dalam WIB. Selanjutnya cocokkan percobaan dengan audit backend dan log native di
HP melalui ADB. Audit Google yang kosong hanya mengarahkan diagnosis ke tahap
sebelum sesi terbit; itu belum membuktikan penyebabnya.

`GetCredentialCancellationException` bisa terjadi karena pembatalan pengguna
atau kendala teknis/konfigurasi. Aplikasi tidak mengulang pemilih akun otomatis.
Lihat [panduan troubleshooting Android](https://developer.android.com/identity/sign-in/credential-manager-troubleshooting-guide).

Login di perangkat, notification center, push FCM, dan TalkBack tetap perlu diuji
sebelum checklist PR-095 dinyatakan lulus.
