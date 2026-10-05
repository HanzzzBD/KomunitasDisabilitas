# PR-091 — Checklist TalkBack & setelan OS (onboarding + tema)

> Dijalankan owner di APK EAS internal (U-35), di **dua versi Android dari dua vendor**. Pakai
> akun **baru** (profil aksesibilitas kosong) supaya wizard muncul. Isi kolom hasil dengan ✅ / ❌
> + catatan singkat.
>
> Yang terbukti di unit test: pemetaan setelan OS, sinkron akun (server menang per field, `null`
> tidak ditulis, balapan GET), keputusan wizard, hapus preferensi saat keluar, mesin langkah, dan
> `KotakCentang` (role/state/target sentuh). Yang hanya bisa dibuktikan di sini: ucapan TalkBack,
> perpindahan fokus, dan tata letak pada skala ekstrem.

| Perangkat (vendor) | Versi Android | Versi TalkBack |
|---|---|---|
| 1 | | |
| 2 | | |

## Wizard dengan TalkBack

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 1 | Masuk dengan akun baru | Wizard terbuka; judul "Atur aplikasi ini" terbaca | | |
| 2 | Sapu ke kotak ragam | "Buta atau susah lihat, kotak centang, tidak dicentang" | | |
| 3 | Ketuk dua kali | "…dicentang" | | |
| 4 | "Lanjut" | Fokus pindah ke "Langkah 2 dari 4: Izin Anda, judul" — bukan tetap di tombol | | |
| 5 | Kotak izin | "Ya, saya izinkan…, kotak centang, **tidak dicentang**" + petunjuk | | |
| 6 | Langkah 3, "Perbesar huruf" | Nilai "125 persen" diumumkan; huruf seluruh layar membesar | | |
| 7 | "Warna lebih tegas" | Palet hitam-putih berlaku seketika, termasuk bilah judul | | |
| 8 | Langkah 4 | Tiap baris terbaca satu kali: "Warna lebih tegas: Menyala" | | |
| 9 | "Simpan lalu mulai" | Beranda terbuka; Kembali tidak membuka wizard lagi | | |
| 10 | "Lewati saja" di langkah mana pun | Langsung Beranda; preferensi yang sudah diubah tetap berlaku | | |
| 11 | Mode pesawat, "Simpan lalu mulai" | Galat diumumkan + "Pilihan Anda tetap berlaku di HP ini" + tombol "Lanjutkan saja" | | |

## Setelan Android (ubah saat app terbuka)

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 12 | Akun belum memilih apa pun; nyalakan **Teks kontras tinggi** di Setelan | Palet kontras tinggi berlaku tanpa restart | | |
| 13 | Nyalakan **Hapus animasi** | Transisi antarlayar tanpa animasi geser | | |
| 14 | Di wizard pilih eksplisit "Warna lebih tegas" = mati, lalu nyalakan Teks kontras tinggi di OS | Palet tetap normal (eksplisit > OS) | | |
| 15 | Ukuran font OS terbesar + Ukuran tampilan terbesar | Teks membesar; tidak ada teks terpotong | | |

## Skala ekstrem (font OS 200% + "Besar huruf" 200%)

| # | Layar | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 16 | Masuk, Kode | Semua bisa digulir; tombol tidak terpotong | | |
| 17 | Wizard (4 langkah) | Tombol membungkus ke baris baru; label kotak centang membungkus | | |
| 18 | Beranda + Dialog keluar | Isi Dialog terbaca utuh; tombol terjangkau | | |

## Sinkron lintas perangkat

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 19 | Atur kontras tinggi di **web**, lalu masuk di HP (akun yang sama) | Wizard tidak muncul; kontras tinggi berlaku | | |
| 20 | Selesaikan wizard di HP dengan skala 150%, lalu muat ulang web | Web memakai skala 150% | | |
| 21 | Keluar di HP | Preferensi akun hilang dari HP (layar masuk kembali ke tampilan bawaan/OS) | | |
