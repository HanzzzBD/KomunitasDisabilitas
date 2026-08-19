# PR-035 — Checklist Uji Manual NVDA: Wizard Onboarding Aksesibilitas

> **PR:** PR-035 — Onboarding Wizard Aksesibilitas (FE)
> **Phase:** [04 — Accessibility Experience](../phase-04-accessibility-experience.md)
> **Tanggal dokumen:** 2026-08-16
> **AC yang dipenuhi:** AC PR-035 nomor 4 — "Wizard bisa diselesaikan dengan
> NVDA (checklist manual)".

---

## Status pelaksanaan

> **BELUM DIJALANKAN.** Dokumen ini adalah **instrumen ujinya**, bukan
> laporan hasilnya.
>
> Kolom "Hasil" di seluruh tabel di bawah sengaja dibiarkan kosong. Uji NVDA
> menuntut Windows + NVDA + telinga manusia; ia tidak bisa dijalankan dari
> pipeline, dan tidak boleh dilaporkan sebagai lulus oleh siapa pun yang tidak
> benar-benar mendengarkannya. Menuliskan "✔" di sini tanpa menjalankannya akan
> menghasilkan tepat satu hal: keyakinan palsu bahwa alur ini sudah pernah
> didengar seseorang.
>
> **Cara memakainya:** salin tabelnya ke komentar PR (atau isi berkas ini
> langsung di branch yang sama), jalankan tiap baris, tulis hasilnya beserta
> versi NVDA + peramban yang dipakai, lalu lampirkan sebagai bukti AC nomor 4.

**Lingkungan yang harus dicatat penguji:**

| Butir | Isi |
|---|---|
| Versi NVDA | _(mis. 2024.4)_ |
| Peramban + versi | _(Chrome/Firefox — jalankan minimal satu dari masing-masing keluarga)_ |
| Mode bicara | Bicara (bukan Braille saja) |
| Build yang diuji | Hasil `pnpm --filter @nawasena/web build` + `vite preview` — **bukan** server dev |
| Sakelar | `VITE_ONBOARDING_WIZARD_ENABLED` tidak disetel (bawaan: aktif) |

**Persiapan:** masuk sebagai pengguna yang **belum** pernah menyelesaikan
onboarding. Bila penandanya sudah tertulis, hapus kunci
`nawasena-onboarding-selesai:<id-pengguna>` dari `localStorage` lalu muat ulang.

---

## A. Masuk ke wizard

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| A1 | Masuk sebagai pengguna baru, mendarat di beranda | Halaman berpindah sendiri ke wizard; judul dokumen berganti menjadi "Atur kenyamanan Anda · Nawasena" | | Pengalihan otomatis; pastikan tidak ada pengumuman ganda/berulang |
| A2 | Tekan `Insert`+`T` (baca judul jendela) | Judul halaman wizard, bukan judul halaman sebelumnya | | |
| A3 | Tekan `H` (lompat antar-judul) | `<h1>` "Atur kenyamanan Anda", lalu `<h2>` nama langkah | | Tepat satu `<h1>` |
| A4 | Tekan `D` (lompat antar-landmark) | Satu landmark utama ("main"), satu navigasi bernama "Kemajuan pengaturan" | | Tidak boleh ada `<main>` kedua |

---

## B. Indikator progres & pengumuman pergantian langkah

Inilah bagian yang paling mudah gagal tanpa gejala visual: pengguna yang melihat
layar tahu langkahnya berganti; pengguna NVDA hanya tahu bila ia diberi tahu.

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| B1 | Di langkah 1, jelajahi `<nav>` "Kemajuan pengaturan" | Daftar berisi 4 butir; butir yang sedang dibuka disebut sebagai langkah saat ini (`aria-current="step"`) | | Harus **empat**, bukan lebih |
| B2 | Baca live region (`role="status"`) | "Langkah 1 dari 4: Ragam disabilitas" | | Wilayahnya ada sejak awal, bukan lahir bersama pesannya |
| B3 | Tekan "Lanjut" | Terdengar **tanpa diminta**: nomor langkah baru ("Langkah 2 dari 4: Persetujuan") **dan** judul `<h2>` langkah baru (fokus dipindahkan ke sana) | | Ini gabungan dua mekanisme; catat bila salah satunya diam |
| B4 | Tekan "Kembali" dari langkah 2 | Sama seperti B3, untuk langkah 1 | | Mundur harus seinformatif maju |
| B5 | Setelah B3, tekan `Tab` satu kali | Kendali **pertama** isi langkah baru — bukan tombol di bawah isinya | | Inti dari pemindahan fokus; lihat `pr-035-tab-order.md` §5 |
| B6 | Lanjut sampai langkah 4, lalu tekan "Lanjut" lagi | Tidak ada tombol "Lanjut" di langkah terakhir | | Batasnya lewat ketiadaan tombol, bukan tombol mati |

---

## C. Label form — Langkah 1 "Ragam disabilitas"

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| C1 | `Tab` ke kotak centang pertama | Nama grup dari `<legend>` ("Ragam disabilitas Anda (boleh lebih dari satu)") **lalu** label kotaknya, peran "kotak centang", keadaan "tidak dicentang" | | Tanpa `<legend>`, lima kotak terbaca lepas tanpa pertanyaannya |
| C2 | Tekan `Space` | "dicentang" | | |
| C3 | Tekan `Space` lagi | "tidak dicentang" | | |
| C4 | Jelajahi teks langkah dengan panah bawah | Kalimat "Jawaban Anda di langkah ini belum dikirim ke server kami…" terdengar **sebelum** kotak-kotaknya | | Urutan ini disengaja: pengguna berhak tahu ke mana jawabannya pergi sebelum menjawab |
| C5 | Tekan `F` (lompat antar-kolom form) | Kelima kotak, tidak ada kolom lain yang tak terduga | | |

---

## D. Label form — Langkah 2 "Persetujuan"

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| D1 | `Tab` ke kotak persetujuan | Label lengkap ("Saya mengizinkan Nawasena memakai data ragam disabilitas saya"), peran, keadaan **"tidak dicentang"** | | Kalau terdengar "dicentang" di sini, itu cacat UU PDP — laporkan sebagai pemblokir |
| D2 | Diam sejenak pada kotak yang sama | Teks bantuan lewat `aria-describedby`: "Kotak ini kosong sampai Anda sendiri yang mencentangnya." | | Deskripsi, bukan label; NVDA membacakannya menyusul |
| D3 | Baca ketiga butir `<ul>` | Terdengar sebagai daftar tiga butir, termasuk "Menolak tidak mengurangi apa pun…" | | |
| D4 | Tanpa mencentang, tekan "Lanjut" | Berpindah ke langkah 3; tidak ada galat, tidak ada penghalang | | Menolak izin tidak boleh menutup satu pun langkah |

---

## E. Langkah 3 "Preferensi tampilan" — kendali & pratinjau langsung

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| E1 | `Tab` ke penggeser | Label "Ukuran teks", peran penggeser, dan nilainya sebagai **"100 persen"** (bukan "100") | | `aria-valuetext`; angka telanjang tidak berarti apa pun saat dibacakan |
| E2 | Tekan `→` dua kali | "125 persen", lalu "150 persen" | | Langkahnya 25 |
| E3 | Tekan `End` | "200 persen" | | Batas atas WCAG 2.2 §1.4.4 |
| E4 | `Tab` ke "Kontras tinggi", tekan `Space` | "dicentang" | | Perubahan tampilannya sendiri tidak diumumkan — lihat §H1 |
| E5 | Diam sejenak pada tiap kotak 3.2–3.7 | Teks bantuan masing-masing (mis. "Warna dibuat lebih tegas supaya teks lebih mudah dibedakan dari latarnya.") | | Ketujuh kendali harus punya bantuan yang terbaca |
| E6 | Centang **"Teks sederhana"** | "dicentang" — lalu, saat Anda menjelajah ulang layarnya, **seluruh kalimat sudah berganti ke varian sederhana** | | Perubahan besar dan disengaja; lihat §H2 |
| E7 | Sesudah E6, jelajahi ulang langkah 3 | Kalimatnya lebih pendek, artinya tetap sama, tidak ada teks yang hilang atau terpotong | | Ini pratinjau varian `id-simple` (PR-029) |
| E8 | Centang "Saya memakai pembaca layar" | "dicentang" | | Field ketujuh — pernyataan pengguna, bukan deteksi |

---

## F. Langkah 4 "Ringkasan"

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| F1 | Jelajahi daftar ringkasan | Pasangan istilah/definisi: nama preferensi lalu nilainya sebagai **kata** ("Aktif" / "Tidak aktif"), bukan ikon | | Ikon tanpa teks tidak punya nama yang bisa dibacakan |
| F2 | Hitung barisnya | Tujuh preferensi (ukuran teks + enam saklar) | | Tujuh, bukan enam |
| F3 | Baca bagian "Ragam disabilitas" | Pilihan yang tadi dibuat, keadaan izin, lalu "Bagian ini tidak ikut disimpan ke akun Anda dan tidak dikirim ke server kami." | | Penegasan harus berdiri **di sebelah** datanya |
| F4 | Tekan "Simpan dan mulai" | Tombolnya berganti nama menjadi "Menyimpan pilihan Anda…" dan diumumkan sibuk; fokus **tidak** melompat ke awal dokumen | | `aria-disabled`, bukan `disabled` — inilah alasannya |
| F5 | Setelah tersimpan | Halaman berpindah ke beranda; judul dokumen berganti | | |

---

## G. Jalur kegagalan & jalur lewati

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| G1 | Putuskan jaringan, lalu tekan "Simpan dan mulai" | `role="alert"` diumumkan **tanpa diminta**: "Pilihan Anda belum bisa dikirim ke akun Anda…" **dan** "Pilihan Anda tetap berlaku di perangkat ini…" | | Kalimat kedua yang paling penting: ia menjawab "lalu pilihan saya bagaimana" |
| G2 | Sesudah G1, `Tab` menyusuri baris tombol | Tidak ada lagi "Simpan dan mulai"; yang ada "Lanjutkan ke beranda" | | Tombol simpan yang bertahan akan menyuruh pengguna mengulang sesuatu yang tidak perlu diulang |
| G3 | Tekan "Lanjutkan ke beranda" | Mendarat di beranda | | |
| G4 | Ulangi dari awal; di langkah **1**, tekan "Lewati pengaturan ini" | Langsung mendarat di beranda, tanpa galat dan tanpa pertanyaan konfirmasi | | Inti AC nomor 1 |
| G5 | Ulangi; tekan "Lewati pengaturan ini" dari langkah **2**, **3**, dan **4** | Sama seperti G4 di ketiganya | | Tombolnya wajib ada di setiap langkah |
| G6 | Sesudah G4, tekan tombol kembali peramban | **Tidak** kembali ke wizard | | Semantik `replace` |
| G7 | Muat ulang beranda | Wizard **tidak** muncul lagi | | Penanda selesai; ulangi juga sesudah menutup dan membuka peramban |

---

## H. Dua hal yang penguji akan temukan, dan keduanya DISENGAJA

Ditulis di sini supaya tidak dilaporkan sebagai cacat — dan supaya, bila penguji
tidak sependapat, ketidaksependapatan itu punya tempat untuk dinyatakan.

**H1 — Perubahan preferensi tidak punya live region "kontras tinggi
diaktifkan".** Yang diumumkan hanyalah keadaan kendalinya sendiri ("dicentang"),
lewat mekanisme natif `<input type="checkbox">`. Alasannya: yang berubah oleh
kendali-kendali ini adalah **tampilan visual** (warna, gerak, ukuran target
sentuh), dan mengumumkan "kontras tinggi diaktifkan" kepada pengguna yang tidak
melihat layarnya hanya mengulang apa yang baru saja ia lakukan dengan kata yang
berbeda. Live region kedua di layar yang sudah punya satu (`role="status"` progres)
juga berisiko saling menyela. **Bila penguji NVDA berpendapat lain — mis. karena
"dicentang" saja terasa menggantung — catat di sini; itu perubahan pada
`langkah-preferensi.tsx`, bukan pada checklist ini.**

**H2 — Menyalakan "Teks sederhana" mengganti seluruh teks layar seketika, tanpa
konfirmasi.** Itu memang pratinjaunya, dan pengguna sudah diberi tahu sebelumnya
di kalimat pembuka langkah 3 ("Setiap perubahan di sini langsung terlihat di
layar, sebelum Anda menyimpan apa pun") — pemberitahuan di muka inilah yang
diminta WCAG 2.2 §3.2.2 (On Input). Fokus **tidak** berpindah dan urutan Tab
**tidak** berubah; hanya kata-katanya. Verifikasi ini di E6/E7.

**H3 — Melewati wizard SESUDAH menyentuh langkah 3 tidak mengembalikan
preferensinya.** Yang dilewati adalah penyimpanannya ke akun, bukan pilihan yang
sudah pengguna lihat/dengar hasilnya. Jangan laporkan sebagai kebocoran.

---

## Kriteria lulus

AC nomor 4 terpenuhi bila **kedua jalur** — selesai (§A–F) dan lewati (§G4–G7) —
dapat ditempuh dari awal sampai akhir hanya dengan NVDA + papan ketik, **tanpa
satu pun kendali yang tidak punya nama terbaca**, dan tanpa satu pun pergantian
langkah yang berlalu tanpa pengumuman.

Kegagalan pada baris mana pun ditulis apa adanya di kolom "Hasil", beserta apa
yang **sebenarnya** terdengar — bukan hanya "gagal". Yang memperbaikinya butuh
kalimat itu.

---

## Lapis lain yang MENUTUP hal berbeda (bukan pengganti checklist ini)

| Lapis | Berkas | Yang dijaminnya |
|---|---|---|
| Unit/komponen (jsdom) | `apps/web/__tests__/onboarding.test.tsx` | Struktur peran/nama, `aria-current`, live region progres, fokus pindah ke judul, alur keyboard-only |
| axe di peramban | `apps/web/e2e/aksesibilitas.spec.ts` + 4 entri di `apps/web/e2e/halaman.ts` | Kontras warna, ukuran target sentuh, pelanggaran WCAG yang bisa dideteksi mesin — **per langkah** |
| E2E alur | `apps/web/e2e/onboarding.spec.ts` | Alur selesai & lewati, penanda, `PUT`, semantik `replace` |
| Urutan Tab | [`pr-035-tab-order.md`](./pr-035-tab-order.md) | Daftar lengkap perhentian Tab per langkah |

Tidak satu pun dari keempatnya bisa mendengar. Itulah yang dikerjakan dokumen
ini.
