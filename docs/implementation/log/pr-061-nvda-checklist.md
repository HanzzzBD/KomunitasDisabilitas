# Checklist NVDA — PR-061 Resume Editor FE

Tanggal: 2026-09-25
Target: Chrome/Edge terbaru + NVDA, Windows
Route: `/cv` dan `/cv/:id`

## Daftar dan pembuatan CV

- [ ] Tautan "CV saya" dapat dicapai dari pintasan halaman dengan `Tab`.
- [ ] Judul halaman "CV saya" diumumkan sebagai heading tingkat 1.
- [ ] Tombol "Buat CV dari profil" menyebut keadaan sibuk ketika proses berjalan.
- [ ] Setelah CV dibuat, fokus dan virtual cursor dapat diteruskan ke halaman editor.
- [ ] Kartu CV membacakan judul dan menyediakan aksi "Buka editor" serta "Hapus CV …" yang spesifik.

## Editor per bagian

- [ ] Setiap bagian dikenali sebagai kontrol buka/tutup dan dapat diaktifkan dengan `Enter` atau `Space`.
- [ ] Urutan heading tetap logis: judul halaman tingkat 1, nama bagian tingkat 2, tautan profesional tingkat 3.
- [ ] Setiap input membacakan label, status wajib, bantuan format, dan pesan galat yang terkait.
- [ ] `Tab` mencapai semua input dan tombol tanpa perangkap fokus.
- [ ] Menyimpan satu bagian mengumumkan "Bagian … sudah disimpan".
- [ ] Kegagalan satu bagian tidak menutup bagian tersebut dan tidak menghapus isian yang belum tersimpan.

## Daftar berulang dan reorder

- [ ] Tiap item dibacakan bersama nomor urutnya.
- [ ] Tombol "Pindah ke atas/bawah" menyebut jenis item dan nomor item.
- [ ] Setelah reorder, NVDA mengumumkan posisi lama dan posisi baru lewat live region.
- [ ] Tombol yang tidak berlaku pada item pertama/terakhir diumumkan nonaktif.
- [ ] Tombol hapus menyebut jenis dan nomor item; item lain tidak berubah.
- [ ] Seluruh alur tambah, isi, reorder, hapus, dan simpan dapat selesai tanpa tetikus.

## Tampilan sempit dan teks panjang

- [ ] Pada lebar 320 px dan pembesaran 200%, tidak ada gulir mendatar halaman.
- [ ] Teks ringkasan panjang dapat dibaca dan diedit tanpa terpotong.
- [ ] Target sentuh tombol tetap minimal 44×44 px atau mengikuti preferensi target besar.

## Catatan hasil manual

Diisi saat review dengan perangkat NVDA. Pemeriksaan yang dapat dijamin mesin sudah ditutup oleh
`resume-editor.test.tsx` (struktur/axe/live region) dan `cv-editor.spec.ts` (keyboard/reorder/overflow).
