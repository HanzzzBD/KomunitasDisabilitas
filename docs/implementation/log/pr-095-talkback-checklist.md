# PR-095 - Notification center Android

Belum dijalankan. Gunakan APK yang memuat PR-095; keberhasilan build EAS
yang dilaporkan owner sebelum implementasi ini belum membuktikan alur PR-095.

Prasyarat: dua akun seeker A/B, notifikasi sambutan, lamaran, dan CV;
notifikasi unread lebih dari 20; Firebase + worker untuk bagian push.
Ulangi di dua versi Android, dengan TalkBack dan font OS 200% + teks/target besar.

| # | Verifikasi | Hasil |
|---|---|---|
| 1 | Lima tab tetap ada; tiap header punya tombol Notifikasi, label teks dan target sentuh cukup | [ ] |
| 2 | Badge menyebut jumlah unread server yang persis; tampilan 99+ tetap membacakan jumlah lengkap | [ ] |
| 3 | Count belum dimuat tidak diklaim nol; galat refresh diberi keterangan, count lama tetap tersedia | [ ] |
| 4 | Semua/Belum dibaca mengumumkan pilihan; keadaan loading/kosong/galat dapat dipahami | [ ] |
| 5 | Item TalkBack dibaca utuh: judul, isi, tanggal WIB, dan status baca; tombol menyebut item mana | [ ] |
| 6 | Bahasa sederhana mengubah judul/isi notifikasi dari varian server tanpa request tambahan | [ ] |
| 7 | Paginasi 20 dan Muat berikutnya bekerja; item yang overlap tidak tampil dua kali | [ ] |
| 8 | Tandai satu berubah segera, badge turun; tombol tetap ada dan fokus tidak hilang | [ ] |
| 9 | Putus jaringan saat tandai satu: kedua filter/badge kembali, galat terbaca, coba ulang bisa dipakai | [ ] |
| 10 | Item yang baru dibaca di filter Unread tetap sampai Muat ulang; penjelasan tersedia | [ ] |
| 11 | Tandai semua menunggu server, mencakup halaman belum dimuat; badge tidak dipaksa nol ketika ada kabar baru | [ ] |
| 12 | Kabar lamaran membuka detail milik akun; id akun lain/rusak tidak membocorkan data | [ ] |
| 13 | PDF/draft CV membuka editor tepat; draft AI gagal membuka tab CV untuk formulir manual | [ ] |
| 14 | Welcome tidak menawarkan entitas fiktif; push welcome membuka center; tipe admin tidak diteruskan | [ ] |
| 15 | Foreground FCM: satu banner in-app, tanpa suara/tray/banner OS kedua; fokus input yang sedang diisi tetap | [ ] |
| 16 | Push kemudian poll, dan poll kemudian push untuk ID sama: jumlah tidak naik dua kali | [ ] |
| 17 | Burst beberapa ID diringkas; Buka menuju center; pengumuman TalkBack sekali per batch | [ ] |
| 18 | Banner bertahan lebih dari 10 detik; Buka/Tutup menutupnya; push duplikat tidak membukanya lagi | [ ] |
| 19 | Banner dapat digulir pada font ekstrem, semua aksi terjangkau, layar utama masih dapat dipakai | [ ] |
| 20 | Background/cold push memakai tray normal dan tap membuka entitas; login/wizard selesai sebelum navigasi | [ ] |
| 21 | Resume memperbarui badge tanpa mengulang catch-up background sebagai banner; polling berhenti saat background | [ ] |
| 22 | Daftar tidak diurut ulang saat membaca; kabar baru tersedia lewat Muat ulang/masuk kembali | [ ] |
| 23 | Logout saat read/poll berjalan: cache/banner/timer dibuang; akun B dan login ulang A tidak menerima hasil sesi lama | [ ] |
| 24 | Tanpa Firebase/izin push: center, baca, badge dan banner hasil polling tetap berfungsi | [ ] |

Flow yang disiapkan: `notification-read.yaml` dan `notification-foreground.yaml`
di `apps/mobile/.maestro/`. Keduanya belum dijalankan. Bagian foreground memakai
push nyata yang dikirim terpisah ke akun uji.
