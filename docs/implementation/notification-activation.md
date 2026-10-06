# Aktivasi notifikasi Web/Android

Perbaikan tambahan Phase 19, 6 Oktober 2026.

## Penyebab

Notifikasi dalam aplikasi sudah tercatat, tetapi antrean `notify-push` dan
`notify-email` tidak mempunyai konsumen aktif. Saat diagnosis terdapat 11 job
push dan tiga job email menunggu/tertunda. Worker CV yang aktif memang hanya
mengonsumsi PDF, ekstraksi draft, dan pencatatan AI.

`EMAIL_FROM` lokal mengandung nama dan alamat tanpa format `Nama <alamat>`.
Resend menolaknya. Adapter sebelumnya menganggap seluruh 400/422 sebagai
alamat penerima yang salah, sehingga job selesai tanpa email terkirim.

Web hanya memperbarui lencana saat tab memperoleh fokus. Android tidak
menyediakan pengaturan kanal email/push akun, dan tombol aktivasi perangkat
belum menyalakan kembali preferensi push akun yang pernah dimatikan.

## Perubahan

- Mode `--notifications-only` / `dev:notifications` menjalankan push dan email
  tanpa cron atau konsumen fitur lainnya. Mode penuh dan CV tetap tersedia;
  flag salah atau mode campuran ditolak sebelum boot.
- Format pengirim divalidasi saat boot. Penolakan `from` menjadi kegagalan
  kanal yang terlihat, bukan penerima yang dilewati. Konfigurasi lokal
  diperbaiki dengan mempertahankan alamat pengirim; tidak ada rahasia di repo.
- FCM menggunakan channel Android `lamaran`. Token hanya dihapus jika detail
  FCM menyatakan token tidak terdaftar/cacat; galat proyek/payload tidak menghapus
  perangkat yang masih sah.
- Lencana Web memeriksa hitungan setiap 30 detik selama tab terlihat dan sesi
  masuk, memakai abort signal. Pusat notifikasi tetap menyediakan muat ulang.
- Pengaturan akun Android menyediakan pilihan email/push tersimpan dan tombol
  izin HP. Email tetap opt-in dan hanya dikirim ke alamat terverifikasi.
  Aktivasi HP menyimpan preferensi push setelah registrasi perangkat berhasil.
- Build lokal memakai `google-services.json` bila tersedia; berkas EAS tetap
  mengambil prioritas. Tanpa keduanya, aplikasi menyatakan push belum tersedia.
  Berkas Firebase tetap di-ignore.

## Penggunaan

```powershell
pnpm --filter @nawasena/worker dev:notifications
```

Untuk email, nyalakan **Kirim kabar lewat email** di pengaturan notifikasi Web
atau pengaturan akun Android. Untuk HP, pilih **Aktifkan notifikasi HP** dan
izinkan notifikasi di Android. Pilihan berlaku untuk kabar berikutnya; notifikasi
lama yang tidak pernah diantrekan tidak dikirim ulang secara massal.

API dan worker harus membaca env yang sama. APK harus menggunakan API HTTPS
yang sesuai dan konfigurasi Firebase yang cocok. Tampilan pengaturan terbaru
memerlukan APK baru. Pengiriman FCM/Resend yang diterima provider tidak
menyatakan pesan sudah terlihat di layar HP atau kotak masuk.

SMS/WhatsApp di proyek merupakan transport OTP/kabar akun, bukan kanal untuk
setiap peristiwa lamaran. Akun Twilio lokal berstatus aktif **Trial**, sehingga
batas penerima trial tetap berlaku.

## Verifikasi

Google OAuth dan FCM `validate_only` berhasil memeriksa kredensial tanpa
pengiriman. Firebase Android lokal cocok dengan project API dan package aplikasi;
variabel berkas Firebase tersedia pada EAS preview. Resend membatasi kunci
ke pengiriman, sehingga endpoint baca domain menolak akses tersebut.

Setelah aktivasi worker, tiga push dari antrean diterima FCM. Tiga email yang
ditolak karena pengirim salah pada eksekusi diagnosis diulang secara terbatas
sesudah konfigurasi diperbaiki; ketiganya diterima endpoint resmi Resend.
Preferensi, verifikasi alamat, dan status akun tetap diperiksa worker saat kirim.
Liveness/readiness API lokal memberi 200. Tidak dilakukan replay massal atau
pengiriman uji ke alamat penerima baru.

Tes mencakup galat sender, format env, klasifikasi FCM, pemilihan worker, polling
Web, pengaturan kanal Android, izin ditolak, dan kegagalan simpan. Smoke test
viewer notifikasi/TalkBack pada perangkat serta konfirmasi inbox tetap memerlukan
perangkat penerima.

Verifikasi lokal: API notifikasi/push/email 127 tes, sender/env 45 tes,
mobile 194 tes, native 10 tes, mode worker 5 tes, Web 33 tes dan browser 4 tes
lulus. Bundling Android berhasil (1174 modul). Lighthouse desktop 100/100;
3G performance 76 dan accessibility 100 pada ketiga putaran.

Referensi: [FCM HTTP v1 error codes](https://firebase.google.com/docs/cloud-messaging/error-codes),
[Expo SDK 57 notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/),
[Resend domain API](https://resend.com/docs/api-reference/domains/list-domains).
