# Checklist NVDA — PR-078 Dialog lamar (Disclosure Control)

Tanggal: 2026-10-02
Target: Chrome (Playwright, `--force-renderer-accessibility`) + NVDA, Windows 11
Route: `/lowongan/:id` sesudah masuk (API dipalsukan `palsukanApi`, disajikan dari `dist`)
Harness: `apps/web/verifikasi/lamar-nvda.verifikasi.ts` (pola `feed-nvda`, ucapan dari jendela
lain dibuang)
Status: **DIJALANKAN — SAH** (keputusan owner 2026-10-02: jalankan sekarang). Tiga run; setiap
langkah tercatat `jendelaUjiDiDepan: true`. Laporan JSON dan log `%TEMP%\nvda-verifikasi-*`
dihapus sesudah dibaca.

Yang SUDAH dibuktikan otomatis: axe (Playwright `e2e/lamar.spec.ts` — dialog terbuka, galat,
pratinjau "Ya", tanpa CV, hasil), alur keyboard-only kedua mode pengungkapan, nama & deskripsi
radio (jsdom `lamar.test.tsx`).

## Dialog

- [x] Membuka dialog membacakan nama + deskripsi: *"Lamar: Staf Layanan Pelanggan dialog Dua
      langkah: pilih CV, lalu putuskan apakah data disabilitas Anda ikut dikirim."*
- [x] Tombol pemicu dibacakan *"Lamar lowongan ini button collapsed opens dialog"*.
- [x] Fokus terjerat: Tab berputar CV → pilihan pengungkapan → Batal → Kirim, tidak lolos ke
      halaman di belakang.

## Pilihan CV

- [x] *"CV yang dikirim grouping"*, lalu *"CV Utama Terakhir diubah 25 September 2026 radio
      button checked 1 of 1"* — CV bawaan terpilih dan tanggalnya terbaca.

## Pilihan pengungkapan (AC "Default = TIDAK; tanpa pre-checked", "konsekuensi dijelaskan")

- [x] Grup dibacakan dengan pertanyaannya: *"Kirim data disabilitas Anda ke perusahaan?
      grouping"*.
- [x] Kedua radio dibacakan **not checked** saat pertama dijangkau.
- [x] Konsekuensi dibacakan SEKALI sebagai deskripsi: *"Ya, kirim data disabilitas saya radio
      button not checked Perusahaan menerima salinan … 1 of 2"*.
      **Run 1 menemukan cacat:** konsekuensi ikut masuk nama aksesibel (ada di dalam `<label>`)
      DAN deskripsi, sehingga dibacakan dua kali. Diperbaiki dengan `aria-labelledby` ke teks
      label saja; run 2–3 membacakannya sekali. Dijaga `lamar.test.tsx`
      (`toHaveAccessibleName`).
- [x] Panah atas/bawah berpindah antara Ya/Tidak dan membacakan status *checked* + konsekuensi.

## Galat (kirim tanpa memilih)

- [x] Galat diumumkan sebagai *alert* dan deskripsi grup: *"… grouping Pilih salah satu: kirim
      data disabilitas, atau jangan kirim."*; fokus pindah ke radio pertama yang bisa dipilih.

## Hasil

- [x] Sesudah Kirim, fokus mendarat di *"Lamaran terkirim heading level 3"* di wilayah "Cara
      melamar"; panah bawah membacakan isi dan status pengungkapan.
- [~] **Temuan minor, diterima:** di antara "busy" dan judul hasil, NVDA sempat membacakan
      *"Pintasan halaman navigation landmark link Notifikasi"*. Fokus akhir benar. Mencoba
      memindah fokus sinkron (`flushSync`) tidak mengubahnya (run 3) — sumbernya kursor mode
      jelajah NVDA yang diatur ulang saat dialog lenyap dari buffer, bukan celah fokus.

## Belum dicakup run ini

- [ ] Pratinjau "Yang akan dikirim ke perusahaan" saat "Ya" dipilih — muncul SESUDAH grup
      (bukan live region); pengguna yang menelusuri ke bawah menemukannya. Belum diperiksa
      dengan telinga apakah urutan itu cukup jelas.
- [ ] Persona Tuli/Netra (Manual Verification) dan uji copy dengan penguji disabilitas (Risks
      PR-078) — butuh orang, bukan harness.
