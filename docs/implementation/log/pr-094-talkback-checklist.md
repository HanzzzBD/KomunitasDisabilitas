# PR-094 — Lamar, tracking, dan push Android

Belum dijalankan. Isi hasil hanya sesudah memakai APK PR-094 di perangkat fisik.
Build EAS PR-090..093 yang selesai pada 2026-10-05 tidak memuat kode PR-094.

Prasyarat: dua akun seeker (A/B), CV, consent profil A dengan ragam/akomodasi,
tiga lowongan aktif yang belum dilamar, admin untuk memindahkan status,
dan Firebase Android + worker `notify-push` untuk bagian push.
Jalankan di dua versi Android, TalkBack aktif, lalu ulangi layar inti pada font OS 200%.

| # | Verifikasi | Hasil |
|---|---|---|
| 1 | Tab Lamaran terbaca jelas; lima tab tetap bisa disentuh pada font besar | [ ] |
| 2 | Lamar membuka dialog, fokus masuk ke judul; Kembali/Batal mengembalikan fokus ke pemicu | [ ] |
| 3 | Kedua pilihan disclosure mulai kosong, sama ukuran; Kirim tanpa memilih membacakan galat | [ ] |
| 4 | CV terbaru terpilih; opsi CV terbaca beserta tanggal, dapat diganti | [ ] |
| 5 | Tanpa CV: buat dari profil, periksa CV di editor, kembali ke lowongan, lamar | [ ] |
| 6 | Consent kosong/dicabut: Ya nonaktif dan alasannya terbaca; Tidak tetap dapat dikirim | [ ] |
| 7 | Ya: pratinjau ragam, tag, catatan sesuai profil; admin hanya menerima snapshot yang dipilih | [ ] |
| 8 | Tidak: admin tidak menerima snapshot data sensitif; isi CV tetap diperiksa pengguna | [ ] |
| 9 | Klik Kirim cepat/ganda atau putus jaringan lalu coba ulang menghasilkan satu lamaran | [ ] |
| 10 | Sesudah kirim, detail lamaran terbuka dan status terbaru diumumkan | [ ] |
| 11 | Kembali ke lowongan menunjukkan status + Lihat lamaran, tanpa tombol Lamar lagi | [ ] |
| 12 | Daftar: tiap kartu satu elemen TalkBack; kosong, galat, muat ulang, dan halaman lanjut bisa dipakai | [ ] |
| 13 | Timeline mulai Lamaran dikirim, urut kronologis, nomor/jumlah/status terbaru/aktor terbaca | [ ] |
| 14 | Tarik meminta konfirmasi; berhasil = Ditarik dan fokus pindah ke status; tidak bisa melamar ulang | [ ] |
| 15 | offered/hired: Saya diterima satu ketukan; hasil berupa teks dan fokus ke judul Selamat | [ ] |
| 16 | Lamaran akun B dibuka dari akun A: data tidak tampil, pesan tidak ditemukan; tidak ada kebocoran cache | [ ] |
| 17 | Lamar/tracking/dialog pada font 200% dapat digulir sampai semua tombol, tanpa potongan teks | [ ] |
| 18 | Izin push tidak muncul otomatis; tombol Aktifkan notifikasi lamaran membuka izin OS | [ ] |
| 19 | Izin ditolak: status tetap bisa dibaca; Buka setelan HP tersedia; izinkan lalu coba ulang | [ ] |
| 20 | Warm start: tap push membuka UUID lamaran tepat, satu kali | [ ] |
| 21 | Cold start: tap push saat app ditutup menunggu pemulihan sesi lalu mendarat tepat | [ ] |
| 22 | Tanpa sesi atau onboarding belum selesai: tautan tertunda sampai kedua gerbang selesai | [ ] |
| 23 | Payload/URL rusak dan tipe admin tidak membuka layar privasi; skema/path/UUID asing ditolak | [ ] |
| 24 | Logout: baris perangkat hilang, token native dicabut; login akun B tidak menerima push A | [ ] |
| 25 | Ulangi logout saat jaringan terputus: app tetap keluar; periksa token/worker pada koneksi pulih | [ ] |
| 26 | Umami: daftar hanya akun baru, profil_lengkap sekali, cv_dibuat via profil, lamar, wawancara sekali, hired_confirmed | [ ] |
| 27 | Payload statistik tanpa nama, kontak, UUID entitas, query, atau pilihan disclosure | [ ] |
| 28 | Matikan statistik di Profil: tidak ada request; tetap mati setelah restart HP/app | [ ] |

Otomasi yang disiapkan: `.maestro/apply-tracking.yaml` dan `.maestro/push-lamaran.yaml`.
Flow push hanya mengetuk notifikasi nyata; uji cold/warm dan login tetap memerlukan konfigurasi FCM.
