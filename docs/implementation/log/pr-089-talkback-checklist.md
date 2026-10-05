# PR-089 — Checklist TalkBack per komponen (`@nawasena/ui-native`)

> Dijalankan owner di APK EAS internal (U-35), di **dua versi Android** (mitigasi risiko PR-089:
> perilaku TalkBack antar-versi). Isi kolom hasil dengan ✅ / ❌ + catatan singkat.
>
> Komponen belum dipakai layar mana pun selain Beranda. Untuk uji ini, gunakan layar uji
> sementara di build lokal atau tunggu PR-090 (login) yang memakai Tombol + Masukan + Dialog.
> Yang terbukti di unit test (jest-expo, Android): role, label, state, target sentuh, skala teks,
> event fokus Dialog. Yang hanya bisa dibuktikan di sini: **apa yang benar-benar diucapkan** dan
> **ke mana fokus benar-benar pindah**.

| Perangkat | Versi Android | Versi TalkBack |
|---|---|---|
| 1 | | |
| 2 | | |

## Tombol

| # | Langkah | Yang diharapkan diucapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 1 | Sapu ke tombol "Kirim lamaran" | "Kirim lamaran, tombol" (+ petunjuk bila ada) | | |
| 2 | Tombol `nonaktif` | "…, tombol, dinonaktifkan" | | |
| 3 | Tombol `sibuk` | "…, sibuk" / "dinonaktifkan" | | |
| 4 | Ketuk dua kali | Aksi berjalan; tombol nonaktif tidak bereaksi | | |
| 5 | Ukur area sentuh (Accessibility Scanner) | ≥ 44 dp; ≥ 56 dp dengan target besar | | |

## Masukan

| # | Langkah | Yang diharapkan diucapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 1 | Sapu ke kolom "Email" | "Email, kotak edit" — label tidak dibaca dua kali | | |
| 2 | Kolom dengan petunjuk | Petunjuk dibaca sesudah nama | | |
| 3 | Picu galat | Galat diumumkan sekali saat muncul (live region) | | |
| 4 | Fokus ulang kolom bergalat | Galat dibaca sebagai petunjuk kolom | | |

## Kartu

| # | Langkah | Yang diharapkan diucapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 1 | Kartu statis | Judul, teks, dan tombol di dalamnya terbaca satu per satu | | |
| 2 | Kartu dapat ditekan | Satu fokus: label kartu + "tombol" | | |

## Dialog

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 1 | Buka dialog dari tombol pemicu | Fokus pindah ke judul; "Hapus CV?, judul" | | |
| 2 | Sapu ke depan/belakang | Fokus terkurung di dalam dialog | | |
| 3 | Tekan Kembali (Android) | Dialog tertutup | | |
| 4 | Sesudah tertutup | Fokus kembali ke tombol pemicu, bukan awal layar | | |
| 5 | Profil "kurangi gerak" | Dialog muncul tanpa animasi fade | | |

## Token a11y

| # | Langkah | Yang diharapkan | Hasil 1 | Hasil 2 |
|---|---|---|---|---|
| 1 | Skala huruf OS terbesar | Teks membesar, tidak terpotong di tombol/kolom | | |
| 2 | Profil kontras tinggi (PR-091) | Hitam-putih murni, garis kolom pekat | | |
