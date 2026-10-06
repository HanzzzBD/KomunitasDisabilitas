# CV AI dan PDF Web/Android

Perbaikan tambahan Phase 19, 6 Oktober 2026.

## Perilaku

- Web: CV → Buat CV dengan AI → percakapan → susun draft → editor → PDF.
- Android: alur yang sama tersedia di tab CV. Percakapan tersimpan di server;
  sambungan yang putus memakai `Last-Event-Id`, tanpa mengirim ulang pesan.
  Kuota dan jalur CV dari profil tetap tersedia. Hasil AI harus diperiksa pengguna.
- PDF dapat dibuat dan dibuka dari daftar CV maupun editor Android. Browser
  mengunduh berkas; Android menyimpan di cache dan membuka viewer atau lembar bagikan.

## Penyebab dan perbaikan

Android sebelumnya hanya menyediakan CV dari profil dan mengarahkan pengguna ke
Web untuk CV AI. Kini `CvChatScreen` memakai endpoint AI yang sudah ada dan
transport `expo/fetch` yang mendukung streaming. Tidak ada provider AI langsung
di klien. Tautan `nawasena://cv/chat` masuk ke stack CV.

Status PDF lokal memberikan URL MinIO `127.0.0.1`. HP dan browser yang mengakses
Web melalui HTTPS tidak bisa mengunduh dari alamat itu. Endpoint baru
`GET /api/v1/me/resumes/:id/pdf/download` memeriksa sesi, pemilik CV, dan hash
revisi terkini, lalu membaca storage internal. Respons `application/pdf` memakai
nama berkas stabil dan `Cache-Control: private, no-store`. PDF lama ditolak 409;
CV orang lain ditolak 404. Pembacaan dibatasi `PDF_RENDER_MAX_BYTES`.

SDK mengunduh dengan header Authorization dan refresh 401. Web serta Android
menggunakan berkas dari API; token tidak dimasukkan ke URL. Endpoint status dan
URL presigned tetap tersedia untuk kompatibilitas klien lama.

Kunci cache Community dan endpoint ekspor data SDK dipisahkan dari modul yang
dipakai shell. Halaman awal tidak lagi memuat kontrak CV, AI, ekspor, dan
moderasi Community. Bundel JS awal turun dari 148,99 KB ke 141,73 KB gzip
(138,4 KiB menurut pemeriksa budget); tes bundle menjaga batas pemuatan ini.

## Menjalankan lokal

API dan worker membaca `apps/api/.env`. Kunci AI, Postgres, Redis queue, storage
privat, bucket, dan `PDF_CHROMIUM_EXECUTABLE_PATH` harus tersedia. Pada mesin
verifikasi konfigurasi itu sudah terisi dan provider AI serta PDF berhasil dipakai.

Antrean lokal CV diperiksa dan belum mempunyai worker aktif. Worker CV dapat
dijalankan secara khusus dengan:

```powershell
pnpm --filter @nawasena/worker dev:cv
```

Mode `--cv-only` hanya menjalankan `pdf-render`, `ai-extract-resume`, dan
`ai-usage-record`. Mode ini tidak menjalankan konsumen email/push atau cron.
Worker penuh tetap memakai perintah `dev` biasa. Mode CV untuk pengembangan,
bukan pengganti worker penuh pada deployment.

APK yang dibangun sebelum perubahan ini tetap membawa layar lama; buat dan
pasang APK internal terbaru. URL API pada build harus menunjuk API HTTPS yang
menjalankan perubahan ini. Tidak diperlukan domain MinIO publik.

## Verifikasi

Tes mencakup kepemilikan unduhan, revisi berubah, header privat, refresh token,
penolakan berkas non-PDF, SSE/reconnect Android, dan alur layar native sampai
editor. Alur Web diperiksa pada Chrome nyata, termasuk unduhan Blob dan chat AI.
Provider AI nyata berhasil memberi jawaban dan mengekstrak draft untuk akun
sintetis. Renderer Chromium dan MinIO menghasilkan PDF 36.404 byte; unduhan API
menjawab 200 dengan signature `%PDF-`. Fixture dan objek uji dibersihkan.

Tidak ada perangkat Android terhubung untuk smoke test viewer dan TalkBack.
Tes native serta bundling Android tidak menyatakan smoke test perangkat selesai.

Seluruh 194 tes SDK lulus, termasuk pemeriksaan pemuatan kontrak. Snapshot
katalog galat memuat `PDF_BELUM_SIAP`, dan tes keyboard panel pengaturan memilih
tautan dari landmark bernama agar utility aksesibilitas di shell tetap tersedia.
Lighthouse pada build akhir: desktop performance/accessibility 100/100;
3G performance 76, 80, 76 dan accessibility 100 pada ketiga putaran.

Referensi transport: [Expo SDK 57 — expo/fetch](https://docs.expo.dev/versions/v57.0.0/sdk/expo/#expofetch-api).
