# Checklist NVDA — PR-079 "Lamaran Saya" (detail lamaran)

Tanggal: 2026-10-02
Target: Chrome (Playwright, `--force-renderer-accessibility`) + NVDA, Windows 11
Route: `/lamaran/:id` (lamaran uji berstatus Penawaran kerja; API dipalsukan `palsukanApi`,
disajikan dari `dist`)
Harness: `apps/web/verifikasi/lamaran-nvda.verifikasi.ts`
Status: **DIJALANKAN — SAH** (keputusan owner 2026-10-02). Satu run; setiap langkah
`jendelaUjiDiDepan: true`. Laporan JSON dan log `%TEMP%\nvda-verifikasi-*` dihapus segera
sesudah dibaca.

> **Privasi:** pada langkah pertama sebuah notifikasi toast dari aplikasi lain milik owner ikut
> dibacakan NVDA meski jendela uji di depan — penjaga "buang ucapan dari jendela lain" tidak
> menangkap toast sistem. Isinya tidak dicatat di mana pun; laporannya dihapus. **Diperbaiki
> 2026-10-02:** harness kini mematikan "Report notifications" di konfigurasi NVDA sementaranya
> dan menyaring ucapan berpola notifikasi (terbukti dengan toast uji).

Yang SUDAH dibuktikan otomatis: axe (registry "lamaran saya — daftar/detail" + `e2e/lamaran-saya.spec.ts`
untuk dialog tarik, sesudah tarik, sesudah konfirmasi), keyboard-only, `<ol>` + `aria-current`
(jsdom), `document.getAnimations()` kosong di mode kurangi gerak.

## Status terbaru (AC "diumumkan saat halaman dibuka")

- [x] Halaman dimuat → *"Status terbaru lamaran Staf Admin Uji: Penawaran kerja."* dibacakan.
- [x] Sesudah "Saya diterima" → *"Status terbaru lamaran Staf Admin Uji: Diterima bekerja."*
      diumumkan lewat wilayah yang sama.

## Lini masa (AC "ordered list semantik")

- [x] NVDA `l` → *"Riwayat status region list with 4 items 1. Lamaran dikirim"*.
- [x] Panah bawah membacakan berurutan: waktu → *"2. Sudah dilihat"* → waktu *"— oleh tim
      Nawasena atas nama perusahaan"* → *"3. Undangan wawancara"* → … Kronologi terbaca benar.

## Tarik lamaran

- [x] Pemicu: *"Tarik lamaran button collapsed opens dialog"* di wilayah "Status sekarang".
- [x] Dialog: *"Tarik lamaran ini? dialog"* + akibatnya sebagai deskripsi; tombol *Tutup*,
      *Jangan tarik*, *Ya, tarik lamaran* — tiga nama berbeda (sebelumnya × dan Batal sama-sama
      "Jangan tarik"; ditemukan e2e, diperbaiki sebelum run ini).
- [x] Escape → fokus kembali ke *"Tarik lamaran"*.
- [~] Minor, diterima (sama dengan PR-078): NVDA sempat menyebut tautan lompat sebelum kembali ke
      tombol — kursor mode jelajah diatur ulang saat dialog lenyap; fokus akhir benar.

## Konfirmasi diterima + perayaan (AC "perayaan aksesibel")

- [x] *"Sudah diterima bekerja? region, Saya diterima button"* — emoji tidak dibacakan.
- [x] Satu Enter → *"Selamat, Anda diterima bekerja! heading level 2"* (fokus), lalu kalimat
      terima kasih. Tidak ada animasi.

## Belum dicakup

- [ ] Halaman daftar `/lamaran` dengan NVDA (axe + keyboard sudah).
- [ ] Persona penguji nyata.
