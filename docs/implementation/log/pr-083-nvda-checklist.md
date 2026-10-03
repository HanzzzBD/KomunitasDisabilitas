# Checklist NVDA — PR-083b Dialog moderasi akun (dua langkah)

Tanggal: 2026-10-03
Target: Chrome (Playwright, `--force-renderer-accessibility`) + NVDA, Windows 11
Route: `/admin/pengguna` (API dipalsukan `palsukanApi`, akun uji `PENGGUNA_UJI`; disajikan dari `dist`)
Harness: `apps/web/verifikasi/admin-pengguna-nvda.verifikasi.ts` (toast dibisukan `nvda.ts`)
Status: **DIJALANKAN — SAH** (keputusan owner 2026-10-03). Satu run, setiap langkah
`jendelaUjiDiDepan: true`, tanpa ucapan dari aplikasi lain; laporan & log dihapus sesudah dibaca.

Yang sudah dibuktikan otomatis: axe di kedua langkah dialog + daftar sesudah berhasil
(`e2e/admin-pengguna.spec.ts`, registry "admin — pengguna"), keyboard-only, fokus ke judul
langkah, tidak ada POST sebelum konfirmasi final (jsdom).

## Pemicu & langkah 1

- [x] Pemicu dibaca dalam konteks tabel: *"Daftar pengguna table … row 2 Aksi column 5,
      Tangguhkan Rina Pelamar button collapsed opens dialog"* — nama tombol menyebut orangnya.
- [x] Dialog: *"Tangguhkan akun Rina Pelamar? dialog — Semua sesinya langsung berakhir … Datanya
      tidak dihapus."*, lalu *"Langkah 1 dari 2: tulis alasan, heading level 3"* dan kolom
      *"Alasan (catatan internal) (wajib diisi) edit required"* beserta bantuannya.
- [x] Lanjut tanpa alasan → *"alert: Tulis alasannya dulu."*; kembali ke kolom → *"invalid entry
      … Tulis alasannya dulu."*

## Langkah 2 (AC "konfirmasi dua langkah")

- [x] Lanjut → fokus mendarat di *"Langkah 2 dari 2: periksa lalu konfirmasi, heading level 3"*.
- [x] Panah bawah: *"Anda akan menangguhkan akun Rina Pelamar. Semua sesinya berakhir saat ini
      juga."* → *"Alasan yang akan dicatat:"* → isi alasan.
- [x] *"Ya, tangguhkan button"*.

## Sesudah berhasil

- [x] Fokus kembali ke baris yang sama, tombolnya kini *"Pulihkan Rina Pelamar"* — perubahan
      status terdengar dari nama tombol.
- [~] Kalimat status *"Akun Rina Pelamar ditangguhkan…"* (`role="status"`) tidak terdengar dalam
      4 detik pengamatan — pengumuman fokus mendahuluinya. Diterima: nama tombol baru sudah
      menyampaikan hasilnya; sebelumnya NVDA juga sempat menyebut tautan navigasi saat dialog
      lenyap (perilaku yang sama dengan PR-078/079).
