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

Catat versi Chromium, Adobe Reader, dan NVDA serta hasil tiap kotak saat verifikasi dilakukan. Kotak
manual sengaja belum ditandai: unit/integration test tidak dapat menggantikan inspeksi tag tree dan
pengalaman pembaca layar pada berkas PDF nyata.
