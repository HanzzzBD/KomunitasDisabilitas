# PR-036 — Checklist Uji Manual NVDA: Panel Preferensi Aksesibilitas

> **PR:** PR-036 — Panel Preferensi + Sinkron Lintas Perangkat (FE)
> **Phase:** [04 — Accessibility Experience](../phase-04-accessibility-experience.md)
> **Tanggal dokumen:** 2026-08-20
> **Menutup:** tidak ada AC PR-036 yang menuntut NVDA secara tertulis. Instrumen
> ini ada karena Phase 04 bernama "Accessibility Experience" dan sampai hari ini
> belum satu pun alurnya pernah didengar lewat pembaca layar sungguhan.

---

## Status pelaksanaan

> **BELUM DIJALANKAN.** Dokumen ini adalah **instrumen ujinya**, bukan laporan
> hasilnya.
>
> Kolom "Hasil" sengaja dibiarkan kosong. Uji NVDA menuntut Windows + NVDA +
> telinga manusia; ia tidak bisa dijalankan dari pipeline mana pun, dan tidak
> boleh dilaporkan lulus oleh siapa pun yang tidak benar-benar mendengarkannya.
> Gerbang otomatis (axe, Lighthouse, `harusLolosAksesibilitas`) memeriksa
> STRUKTUR — peran, nama, kontras, urutan fokus. Tidak satu pun dari mereka bisa
> menjawab pertanyaan yang sebenarnya: apakah orang yang memakai pembaca layar
> tahu apa yang baru saja terjadi.
>
> **Cara memakainya:** jalankan tiap baris, tulis hasilnya beserta versi NVDA +
> peramban, lalu lampirkan sebagai bukti pada Testing Checklist PR-036.

**Lingkungan yang harus dicatat penguji:**

| Butir | Isi |
|---|---|
| Versi NVDA | _(mis. 2024.4)_ |
| Peramban + versi | _(Chrome/Firefox — minimal satu dari masing-masing keluarga)_ |
| Mode bicara | Bicara (bukan Braille saja) |
| Build yang diuji | Hasil `pnpm --filter @nawasena/web build` + `vite preview` — **bukan** server dev |
| Akun | Sudah masuk; idealnya DUA akun untuk bagian E |

---

## A. Mencapai panel (AC-5)

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| A1 | Dari halaman mana pun, Tab sampai tautan pintas aksesibilitas | Nama tautan yang jelas menyebut "aksesibilitas", bukan "tautan" telanjang | | |
| A2 | Enter pada tautan itu | Judul halaman panel diumumkan; fokus tidak tertinggal di halaman lama | | |
| A3 | Hitung jumlah interaksi dari halaman sembarang | ≤ 2 interaksi (AC-5) | | |

## B. Ketujuh kendali (AC-7)

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| B1 | Tab ke penggeser skala teks | Peran "penggeser", nama, dan NILAI dalam persen — bukan angka telanjang | | |
| B2 | Panah kanan/kiri pada penggeser | Nilai baru diumumkan setiap langkah (100/125/150/175/200) | | |
| B3 | Tab ke tiap kotak centang (6×) | Nama sakelar + keadaan tercentang/tidak | | |
| B4 | Spasi pada satu kotak centang | Perubahan keadaan diumumkan SEGERA, bukan sesudah jeda | | |
| B5 | Sesudah B4, dengarkan status simpan | "Menyimpan"/"Tersimpan" terdengar lewat `role="status"` tanpa memotong pengumuman keadaan | | |
| B6 | Sakelar yang masih mengikuti perangkat | Keterangan "mengikuti setelan perangkat" ikut terbaca sebagai deskripsi sakelar itu | | |

## C. Reset (AC-4)

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| C1 | Tab ke tombol "Kembalikan ke setelan bawaan" | Nama tombol utuh, dan teks bantuannya terbaca | | |
| C2 | Enter | Perubahan keadaan seluruh kendali dapat diketahui — pengguna tahu SESUATU berubah, bukan hanya menduga | | |
| C3 | Telusuri ulang kendali sesudah reset | Nilainya benar-benar kembali; sakelar yang mengikuti perangkat menyebutkannya lagi | | |

## D. Kegagalan simpan

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| D1 | Matikan jaringan, ubah satu sakelar | Pesan galat Bahasa Indonesia diumumkan MENYELA (`role="alert"`) | | |
| D2 | Periksa kendalinya sesudah D1 | Sakelarnya TIDAK dikembalikan sendiri — yang gagal hanya penyimpanannya | | |

## E. Preferensi mengikuti akun (AC-1, AC-6)

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| E1 | Ubah preferensi di perangkat/profil A, lalu masuk di B | Nilai yang sama terdengar saat menelusuri panel di B | | |
| E2 | Keluar di B, masuk sebagai akun LAIN | Preferensi akun sebelumnya TIDAK terbawa | | |
| E3 | Nyalakan "kurangi animasi" di setelan Windows, lalu masuk dengan akun yang belum pernah mengatur apa pun | Sakelar "Kurangi animasi" terbaca AKTIF dan menyebut "mengikuti setelan perangkat" | | |

> E3 adalah cacat yang diperbaiki remediasi Phase 04 (server dulu selalu
> menjawab nilai konkret, sehingga akomodasi dari sistem padam diam-diam saat
> masuk). Ia sudah dijepit test otomatis, tetapi hanya telinga manusia yang bisa
> memastikan pengguna benar-benar TAHU keadaan sakelarnya.

## F. Zoom & kontras (AC-2, AC-3)

| # | Yang dilakukan | Yang harus terdengar | Hasil | Catatan |
|---|---|---|---|---|
| F1 | Teks 200% + kontras tinggi, telusuri panel | Seluruh kendali masih dapat dicapai dan dinamai | | |
| F2 | Perkecil jendela ke ~320 px pada teks 200% | Tidak ada isi yang hilang atau menuntut gulir dua arah | | |

---

## Bila ada yang gagal

Catat baris yang gagal, versi NVDA + peramban, dan apa yang terdengar
sebenarnya. Kegagalan di sini **bukan** alasan mencentang barisnya dengan
catatan "minor" — tulis apa adanya, lalu putuskan terpisah apakah ia memblokir.

---

## Lampiran — tangkapan ucapan terinstrumentasi (BUKAN pengisian checklist)

> **Status checklist di atas TIDAK berubah: tetap BELUM DIJALANKAN.** Lampiran
> ini bukan hasil uji manual dan tidak boleh dibaca sebagai penggantinya. Kolom
> "Hasil" di seluruh tabel di atas tetap kosong.

**Apa ini.** NVDA 2026.1.1 dijalankan sungguhan di mesin pengembang (bukan
simulasi, bukan pembaca layar lain), level log dinaikkan ke Debug, lalu panel
digerakkan lewat jendela Chromium nyata yang difokuskan. Yang direkam adalah
ucapan yang benar-benar dikirim NVDA ke synthesizer, dibaca dari
`%TEMP%\nvda.log`.

**Batasnya, dan kenapa checklist di atas tetap kosong.** Transkrip membuktikan
APA yang diucapkan — peran, nama, keadaan, isi live region, urutannya. Ia tidak
bisa menjawab baris yang menuntut penilaian manusia: apakah pengumuman terasa
SEGERA, apakah selaan terasa mengganggu, apakah pengguna PAHAM sesuatu berubah.
Itu sebabnya ini lampiran, bukan hasil.

**Lingkungan tangkapan:** NVDA 2026.1.1, synth `oneCore` suara `MSTTS_V110_enUS_DavidM`
(bahasa Inggris), Chromium Playwright, build produksi lewat `vite preview`.
Catatan penting: NVDA melaporkan `'Indonesian (not supported)'` untuk suara ini.
Aplikasi mengirim `lang="id"` dengan benar dan NVDA menghormatinya
(`LangChangeCommand ('id')`), tetapi suara yang terpasang di mesin ini tidak bisa
melafalkan Bahasa Indonesia. Ini keadaan mesin penguji, BUKAN cacat aplikasi —
namun berarti seluruh teks Indonesia pada tangkapan ini dilafalkan suara Inggris.
Uji manual sungguhan harus memakai suara Indonesia.

### Yang terekam

**Penggeser skala teks** — nama, peran, nilai bersatuan, dan bantuan:
```
'Ukuran teks', 'slider', '100 persen',
'Geser ke kanan untuk memperbesar. Maksimal dua kali ukuran normal.'
```
`aria-valuetext` bekerja: yang terdengar "100 persen", bukan "100" telanjang.

**Keenam sakelar** — nama, peran, keadaan, bantuan. Contoh:
```
'Pilihan tampilan lain', 'grouping', 'Kontras tinggi', 'check box', 'not checked',
'Warna dibuat lebih tegas supaya teks lebih mudah dibedakan dari latarnya.'
'Kurangi animasi', 'check box', 'not checked', 'Perpindahan dan animasi dimatikan. …'
'Saya memakai pembaca layar', 'check box', 'not checked', 'Kami tidak bisa dan tidak ingin mendeteksinya sendiri. …'
```

**Perubahan keadaan diumumkan** (Spasi dua kali berturut-turut):
```
'checked'      → 'not checked'      → 'checked'
```

**Konfirmasi simpan lewat `role="status"`:**
```
'Pilihan Anda sudah tersimpan ke akun. '
```

**Perubahan nilai penggeser, termasuk akibat reset:**
```
'125 persen '   (panah kanan)
'100 persen '   (sesudah "Kembalikan ke setelan bawaan")
```

**Kegagalan simpan MENYELA, dengan peran `alert`** (PUT digagalkan sengaja):
```
'alert', 'Pilihan Anda belum bisa dikirim ke akun Anda. Periksa koneksi internet Anda.
         Pilihan Anda tetap berlaku di perangkat ini, meski belum tersimpan ke akun Anda.'
```
Awalan `'alert'` menunjukkan NVDA memperlakukannya sebagai live region asertif —
yaitu perilaku yang dituju `role="alert"` di `panel.tsx`.

### Yang TIDAK terekam pada sesi ini

* Baris A1–A3 (mencapai panel ≤ 2 interaksi): penelusuran Tab sempat keluar ke UI
  Chrome sendiri ("Tab search", "Bookmark this tab"), jadi urutan pintasnya tidak
  bisa diklaim dari tangkapan ini.
* Seluruh bagian E (preferensi mengikuti akun, dua akun, sinyal OS) dan F (zoom).
* Keterangan "mengikuti setelan perangkat" (B6) — tidak muncul pada sesi ini
  sebab mesin penguji tidak meminta kontras/animasi lewat setelan sistem.
* Braille sama sekali.
