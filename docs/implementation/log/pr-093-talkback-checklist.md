# PR-093 — Checklist TalkBack feed, cari, detail

> Dijalankan owner di APK EAS internal (U-35), di **dua versi Android dari dua vendor**. Akun
> dengan profil yang cukup untuk dicocokkan. Isi kolom hasil dengan ✅ / ❌ + catatan singkat.
>
> Yang terbukti di unit test: label kartu satu kesatuan, ambang skor & gaji (paket bersama
> `@nawasena/lowongan`, dipakai web), filter → opsi pencarian, label taksonomi. Yang hanya bisa
> dibuktikan di sini: ucapan TalkBack, pemulihan posisi, banner nyata, dan perilaku di 3G.

| Perangkat (vendor) | Versi Android | Versi TalkBack |
|---|---|---|
| 1 | | |
| 2 | | |

## Feed (tab Beranda)

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 1 | Sapu ke kartu | SATU elemen: "Admin Data. PT …. Kerja penuh waktu. Kerja dari rumah. Bandung…. Sangat cocok, 73 persen. Alasannya: …, tombol" | | |
| 2 | Ketuk dua kali kartu | Detail terbuka; judul lowongan terbaca sebagai judul | | |
| 3 | Kembali | Kembali ke kartu yang sama; posisi gulir tidak kembali ke atas | | |
| 4 | Banner degradasi (AI dimatikan di server) | "AI sedang tidak bisa dipakai…" terbaca saat disapu | | |
| 5 | Banner "AI sedang menyusun" | Urutan TIDAK berubah sendiri; "Lihat urutan yang baru" mengganti daftar + diumumkan | | |
| 6 | "Muat ulang daftar" | Daftar dimuat ulang tanpa gerakan tarik | | |
| 7 | Tarik ke bawah di atas daftar | Juga memuat ulang (alternatif, bukan satu-satunya) | | |
| 8 | "Perbarui rekomendasi" sampai jatah habis | Tombol tetap terjangkau, dibaca "dinonaktifkan" + alasan "Coba lagi besok" | | |
| 9 | Gulir ke akhir | Tombol "Muat lebih banyak lowongan", tidak ada muat otomatis | | |
| 10 | Akun dengan profil kosong | "Isi profil Anda dulu" + tombol "Isi profil" ke tab Profil | | |

## Cari

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 11 | Ketik kata kunci | Hasil TIDAK berubah sebelum "Cari" ditekan | | |
| 12 | "Filter lainnya" | Dibaca "diciutkan" → "diperluas"; jumlah filter aktif disebut | | |
| 13 | Pilih cara kerja + dukungan, "Cari" | "N lowongan ditemukan." diumumkan | | |
| 14 | Pencarian tanpa hasil | "Tidak ada lowongan yang cocok…" diumumkan | | |
| 15 | Buka hasil, kembali | Filter dan posisi daftar tetap | | |

## Detail

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 16 | Navigasi per judul (TalkBack: Judul) | Ringkasan → Deskripsi → Persyaratan → Dukungan → Terbuka untuk → Tentang perusahaan → Cara melamar | | |
| 17 | Baris ringkasan | Satu elemen per baris: "Cara kerja: Kerja dari rumah" | | |
| 18 | Gaji disembunyikan perusahaan | Baris "Gaji" tidak ada sama sekali | | |
| 19 | "Buat teks ini lebih mudah dibaca" | Status sibuk; lalu "Deskripsi pekerjaan: sekarang tampil versi yang mudah dibaca." Fokus tetap di tombol | | |
| 20 | Tombol yang sama → teks asli → sederhana lagi | Tidak meminta ulang ke server (jatah tidak berkurang) | | |
| 21 | Jatah AI habis | Tombol hilang; penjelasan "Jatah AI hari ini sudah habis…"; teks asli tetap | | |
| 22 | Status perusahaan | "Status: Sudah diperiksa. Tim kami sudah memeriksa…" sebagai satu elemen | | |

## 3G & skala ekstrem

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 23 | Jaringan lambat (EDGE/3G), buka Beranda | Indikator "Memuat lowongan untuk Anda" terbaca; tidak ada layar kosong bisu | | |
| 24 | Putus jaringan saat "Muat lebih banyak" | Galat + "Coba lagi"; daftar lama tetap | | |
| 25 | Font OS 200% + "Besar huruf" 200% | Kartu dan banner membungkus; 4 tab tetap terbaca dan bisa disentuh | | |
