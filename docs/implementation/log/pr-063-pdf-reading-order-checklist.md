# Checklist urutan baca PDF — PR-063

Checklist ini memisahkan bukti otomatis dari verifikasi pembaca PDF. Berkas uji dibuat dari CV yang
memuat seluruh bagian, tautan, teks beberapa paragraf, `漢字`, dan emoji `🤟`.

## Bukti otomatis

- [x] Dokumen HTML memakai `lang="id"` dan `<meta charset="utf-8">`.
- [x] Hanya ada satu `h1`; bagian memakai `h2`; item pengalaman/pendidikan memakai `h3`.
- [x] Urutan DOM sama dengan urutan visual: identitas, kontak, ringkasan, pengalaman, pendidikan,
  keahlian, sertifikasi, lalu organisasi.
- [x] Chromium menghasilkan tagged PDF (`tagged: true`) dan outline (`outline: true`).
- [x] Integration test merender aksara non-Latin/emoji, mengunduh objek privat dari MinIO, dan
  memvalidasi signature `%PDF-`.

## Verifikasi manual sebelum merge/release

Jalankan worker dengan Chromium dan MinIO, hasilkan PDF dari fixture lengkap, lalu periksa dengan
Adobe Acrobat Reader + NVDA di Windows.

- [ ] Judul dokumen diumumkan lebih dulu dan tidak ada heading kosong/duplikat.
- [ ] Navigasi `H` mengikuti `h1 → h2 → h3` tanpa lompatan yang membingungkan.
- [ ] Kontak dibaca setelah judul/headline; bullet dekoratif tidak diumumkan sebagai konten.
- [ ] Setiap pengalaman dibaca `posisi → perusahaan/periode → deskripsi`.
- [ ] Perpindahan halaman tidak menyisipkan footer/header atau memotong satu item di tengah.
- [ ] Tautan email, telepon, dan portofolio dikenali sebagai tautan dengan nama yang bermakna.
- [ ] `漢字`, tanda baca Indonesia, dan emoji tidak menjadi kotak kosong; pelafalan emoji mengikuti
  kemampuan reader dan bukan syarat teks alternatif tersendiri.
- [ ] Urutan tab untuk tautan sama dengan urutan baca dokumen.
- [ ] Zoom 200% dan high-contrast reader tidak menghilangkan teks.

### 2026-09-29 — penampil PDF Chrome + NVDA, tanpa Adobe (PR-068c)

Keputusan owner 2026-09-29: Adobe Reader tidak dipasang. Penggantinya dua bukti. Yang pertama adalah
**pohon struktur** PDF hasil worker nyata (`apps/web/verifikasi/struktur-pdf.py`). Yang kedua adalah
**NVDA 2026.1.1** yang membaca PDF itu di penampil PDF Chrome (`pdf-nyata.verifikasi.ts`). Kotak di
atas sengaja belum dicentang karena semuanya menyebut Adobe. Hasil per kotak:

* **Pohon struktur (lolos):** `tagged`, `/Lang id`, judul metadata = judul CV. Heading: H1, lalu H2
  per bagian, lalu H3 per item, tanpa lompatan. Kontak adalah tiga `Link`
  (`mailto:`/`tel:`/`https:`). Keahlian berupa `L`/`LI`. Urutan tag sama dengan urutan baca.
* **Judul lebih dulu, kontak sesudah headline:** lolos.
* **Pengalaman terbaca posisi, lalu perusahaan · periode, lalu deskripsi:** lolos.
* **Tautan (`k`):** lolos. Email, telepon, dan "Portofolio" dikenali sebagai tautan bernama.
* **`漢字`:** lolos.
* **Emoji `🤟`:** NVDA di penampil Chrome membacanya sebagai karakter rusak. Teks PDF-nya benar
  (pypdf mengekstrak `🤟` utuh), jadi ini keterbatasan penampil Chrome/NVDA, bukan berkas kita.
* **Bullet dekoratif `•`** di baris kontak ikut terucap. Dampaknya kecil dan dicatat saja.
* **Navigasi `H`: tidak bisa dinilai di Chrome.** Penampil Chrome menyajikan seluruh halaman sebagai
  satu heading, jadi `h` hanya menemukan satu. Pohon strukturnya sudah benar, tetapi pembuktian di
  pembaca PDF yang memakai tag (Adobe) tetap terbuka.
* Belum diuji: pindah halaman (CV uji hanya 1 halaman), zoom 200%, dan kontras tinggi.

Jalur utuh PR-064 lewat UI juga ditempuh di run yang sama. Langkahnya: "Siapkan PDF", lalu
"PDF siap diunduh." dalam 3,5 dtk, lalu unduh (`%PDF-`, 116 KB), lalu notifikasi "PDF CV Anda siap"
tampil di `/notifikasi`.

Catat versi Chromium, Adobe Reader, dan NVDA serta hasil tiap kotak saat verifikasi dilakukan. Kotak
manual sengaja belum ditandai: unit/integration test tidak dapat menggantikan inspeksi tag tree dan
pengalaman pembaca layar pada berkas PDF nyata.
