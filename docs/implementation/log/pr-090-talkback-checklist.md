# PR-090 — Checklist TalkBack alur masuk (Android)

> Dijalankan owner di APK EAS internal (U-35), di **dua versi Android dari dua vendor**
> (mitigasi risiko PR-090: fragmentasi OEM). Isi kolom hasil dengan ✅ / ❌ + catatan singkat.
>
> Yang terbukti di unit test (Vitest): normalisasi nomor, rapikan kode, pemetaan galat, alur
> nonce → Credential Manager → tukar, dan store sesi (boot/masuk/keluar). Yang hanya bisa
> dibuktikan di sini: **apa yang diucapkan**, **ke mana fokus pindah**, dan **apakah autofill
> serta pemilih akun Google benar-benar muncul**.

| Perangkat (vendor) | Versi Android | Versi TalkBack |
|---|---|---|
| 1 | | |
| 2 | | |

## Layar Masuk

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 1 | Buka app (belum masuk) | Fokus pertama di judul "Masuk ke Nawasena, judul" | | |
| 2 | Sapu ke kolom nomor | "Nomor HP, kotak edit" + petunjuk "Contoh: 0812 3456 7890" | | |
| 3 | Ketuk "Kirim kode" dengan kolom kosong | Galat "Nomor HP belum benar…" diucapkan otomatis | | |
| 4 | Ketik `0812…` (format lokal), "Kirim kode" | Pindah ke layar "Kode masuk" tanpa galat | | |
| 5 | Server mati / mode pesawat, "Kirim kode" | Pesan "Tidak dapat terhubung ke server…" diucapkan segera | | |
| 6 | Sapu ke "Masuk dengan Google" | "Masuk dengan Google, tombol" + petunjuk pilihan akun | | |

## Layar Kode

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 7 | Tiba di layar kode | Judul "Masukkan kode" + nomor tersamar dibaca | | |
| 8 | SMS kode masuk (sender SMS/Twilio) | Keyboard/Gboard menawarkan kode untuk diisi | | |
| 9 | Kode WhatsApp disalin lalu ditempel | Kolom berisi 6 angka saja | | |
| 10 | Kode salah, "Masuk" | Galat server diucapkan; fokus tetap di layar | | |
| 11 | Mengisi 6 angka | **Tidak** mengirim otomatis (WCAG 3.2.2) | | |
| 12 | Hitung mundur kirim ulang | Tidak diumumkan tiap detik; tombol "Kirim ulang kode" muncul setelah 0:00 | | |
| 13 | Kode benar, "Masuk" | Beranda terbuka; tombol Kembali **tidak** kembali ke layar kode | | |

## Google (Credential Manager)

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 14 | Ketuk "Masuk dengan Google" | Lembar pemilih akun sistem muncul, terbaca TalkBack | | |
| 15 | Tutup lembar (Kembali) | Kembali ke layar masuk **tanpa** pesan galat | | |
| 16 | Pilih akun | Beranda terbuka; akun baru/lama sesuai email | | |
| 17 | HP tanpa akun Google | Pesan arahan "Belum ada akun Google di HP ini…" | | |

## Sesi

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 18 | Tutup paksa app, buka lagi | Langsung Beranda (indikator "Memuat Nawasena" sebentar) | | |
| 19 | Mode pesawat, buka app | Layar "Tidak bisa terhubung" + "Coba lagi"; sesi tidak hilang | | |
| 20 | "Keluar" di Beranda | Dialog: fokus ke judul "Keluar dari Nawasena?" | | |
| 21 | "Batal" | Dialog tertutup, fokus kembali ke tombol "Keluar" | | |
| 22 | "Ya, keluar" lalu buka ulang app | Layar masuk; sesi tidak dipulihkan | | |
