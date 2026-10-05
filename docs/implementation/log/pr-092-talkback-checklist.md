# PR-092 — Checklist TalkBack form multi-bagian (profil + CV)

> Dijalankan owner di APK EAS internal (U-35), di **dua versi Android dari dua vendor**. Isi
> kolom hasil dengan ✅ / ❌ + catatan singkat.
>
> Yang terbukti di unit test: pemetaan profil ↔ formulir + consent (`@nawasena/formulir`, dipakai
> web juga), validasi per kolom dengan skema server, konfigurasi karier (POST/PUT), operasi
> naik/turun/hapus, alur PDF (unduh → content:// → viewer → cadangan Bagikan), dan komponen
> `PilihanTunggal`/`Masukan` banyak baris. Yang hanya bisa dibuktikan di sini: ucapan TalkBack,
> urutan fokus di formulir panjang, dan viewer PDF sungguhan.

| Perangkat (vendor) | Versi Android | Versi TalkBack |
|---|---|---|
| 1 | | |
| 2 | | |

## Navigasi

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 1 | Sapu ke tab bawah | "Beranda, tab, 1 dari 3, dipilih" · "Profil, tab, 2 dari 3" · "CV, tab, 3 dari 3" | | |
| 2 | Tab Profil → kartu | "Data dasar, tombol" + petunjuk isi bagian | | |
| 3 | Kembali dari bagian | Kembali ke daftar bagian, fokus tidak hilang ke awal | | |

## Profil

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 4 | Data dasar: kolom | Label + petunjuk dibaca; "Ringkasan" bisa banyak baris | | |
| 5 | Pilihan pengungkapan | "Saat melamar… " lalu tiap opsi "tombol radio, dipilih, 1 dari 3" | | |
| 6 | Simpan | "Data dasar tersimpan." diucapkan | | |
| 7 | Sensitif tanpa izin | Kotak izin "tidak dicentang"; kolom ragam belum tampak | | |
| 8 | Centang izin | Kolom ragam + akomodasi muncul; judul grup terbaca | | |
| 9 | Catatan > 500 huruf / isian salah | Galat diucapkan dan ikut dibaca saat kolom difokus ulang | | |
| 10 | Simpan → tanggal izin | "Anda memberi izin pada …" tampil | | |
| 11 | Cabut izin | Dialog: fokus ke judul "Cabut izin?"; "Batal" mengembalikan fokus ke tombol cabut | | |
| 12 | Ya, cabut | "Izin dicabut. Data … sudah kami hapus." Kolom tertutup lagi | | |
| 13 | Pengalaman: Tambah, isi tanggal salah urut | Galat "Tanggal selesai tidak boleh lebih awal…" di kolom selesai | | |
| 14 | Daftar karier | Tombol "Ubah pengalaman: Desainer" / "Hapus pengalaman: Desainer" — tidak ada "Hapus" kembar | | |

## CV

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 15 | Buat CV dari profil | Editor terbuka; kartu bagian dibaca "Keahlian: 1 keahlian" | | |
| 16 | Bagian Keahlian, 2 item | Judul "Keahlian 1", "Keahlian 2" sebagai judul | | |
| 17 | "Naikkan keahlian 2" | Diumumkan "keahlian 2 dipindah ke urutan 1."; urutan berubah | | |
| 18 | "Naikkan" di item pertama | Dinonaktifkan (dibaca "dinonaktifkan") | | |
| 19 | Kosongkan nama wajib, Simpan | Galat di kolom itu; "Ada isian yang perlu diperbaiki." | | |
| 20 | Kontak: tambah 5 tautan | Tombol "Tambah tautan" nonaktif setelah 5 | | |
| 21 | Buat PDF | Status antre/dibuat diumumkan; tombol "Buka PDF" muncul | | |
| 22 | Buka PDF | Pemilih aplikasi PDF / viewer terbuka; PDF terbaca TalkBack di viewer | | |
| 23 | HP tanpa aplikasi PDF | Lembar Bagikan muncul (simpan ke Files/Drive) | | |
| 24 | Keluar lalu cek Files → cache app | Tidak ada PDF CV tersisa (dibuang saat keluar) | | |

## Skala ekstrem (font OS 200% + "Besar huruf" 200%)

| # | Layar | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 25 | Tab bawah | Label tidak terpotong; tab tetap bisa disentuh | | |
| 26 | Data sensitif, bagian CV dengan 3 item | Semua bisa digulir; tombol membungkus ke baris baru | | |
