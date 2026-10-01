# Checklist NVDA — PR-074 Beranda seeker (feed matching)

Tanggal: 2026-09-30
Target: Chrome/Edge terbaru + NVDA, Windows
Route: `/` sesudah masuk (akun seeker berprofil & bervektor — lihat `embed:ulang`, PR-069b)
Status: **BELUM DIJALANKAN** — utang [U-30](../../utang-teknis.md) (keputusan owner 2026-09-30:
dijalankan saat desktop bebas; harness `apps/web/verifikasi/` merekam jendela yang aktif).

Yang SUDAH dibuktikan otomatis: axe (jsdom `beranda-feed.test.tsx`, Playwright registry
"beranda — feed seeker" + `beranda-feed.spec.ts` untuk keadaan normal, degraded, AI menyusun,
kuota habis), urutan isi kartu di DOM (skor & alasan sebelum tautan, satu tautan per kartu),
`aria-disabled` + `aria-describedby` tombol refresh, fokus & gulir pulih feed → detail → kembali.
Yang di bawah ini hanya bisa dibuktikan telinga manusia.

## Kartu (AC "satu kesatuan bagi SR")

- [ ] Menelusuri dengan panah bawah dari judul kartu (h3) membacakan berurutan: judul → "Kecocokan N% — label" → "Kenapa cocok: …" → info perusahaan/jenis/mode/lokasi → daftar akomodasi → "Lihat detail lowongan …", tanpa keluar-masuk kartu.
- [ ] Navigasi heading (`H`/`3`) melompat antar-kartu dan judulnya cukup untuk memilih.
- [ ] Bar skor TIDAK dibacakan (dekoratif); angka + label dibacakan sekali.
- [ ] "Alasan disusun AI" dibacakan sebagai teks biasa, bukan gambar/ikon tanpa nama.

## Status AI & refresh

- [ ] Saat feed turun (AI mati/kuota habis), banner "Rekomendasi AI sedang tidak tersedia…" diumumkan SEKALI tanpa memindahkan fokus.
- [ ] Saat AI menyusun, banner + tombol "Tampilkan urutan terbaru" diumumkan; menekannya memindahkan fokus ke "Daftar lowongan yang cocok" dan tidak ada kartu yang bergerak sebelum tombol ditekan.
- [ ] "Segarkan rekomendasi" membacakan sisa kesempatan sebagai deskripsinya; sesudah ditekan, "Rekomendasi diperbarui." diumumkan.
- [ ] Saat jatah habis, tombol dibacakan "tidak tersedia/redup" BESERTA alasannya, dan fokus tidak hilang setelah menekan jatah terakhir.

## Kosong & jembatan

- [ ] Profil belum siap: judul + ajakan "Lengkapi profil" tercapai dengan `Tab`.
- [ ] "Cari lowongan lain" membuka halaman cari dengan provinsi profil sudah terisi dan diumumkan sebagai tautan.

## Kombinasi preferensi a11y

- [ ] Mode teks sederhana: bar skor dan catatan AI hilang; kalimat skor "Sangat cocok (78%)".
- [ ] Kontras tinggi + skala teks 200%: kartu tidak terpotong, tombol tetap ≥ target sentuh.
- [ ] Kurangi gerakan: tidak ada animasi saat daftar diganti.
