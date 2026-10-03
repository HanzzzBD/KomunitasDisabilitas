# Checklist NVDA — PR-081 Dasbor metrik admin

Tanggal: 2026-10-03
Target: Chrome (Playwright, `--force-renderer-accessibility`) + NVDA, Windows 11
Route: `/admin` (API dipalsukan `palsukanApi`, fixture `metrikAdminUji`; disajikan dari `dist`)
Harness: `apps/web/verifikasi/admin-metrik-nvda.verifikasi.ts` (toast dibisukan `nvda.ts`)
Status: **DIJALANKAN — SAH** (keputusan owner 2026-10-03). Tiga run, setiap langkah
`jendelaUjiDiDepan: true`; laporan & log dihapus sesudah dibaca.

Yang sudah dibuktikan otomatis: axe (registry "admin — ringkasan" + `e2e/admin-metrik.spec.ts`
untuk 30d & 7d), keyboard-only, auto-refresh tanpa mencuri fokus (jam palsu Playwright),
`<dt>/<dd>`, tabel ber-caption (jsdom).

## Periode

- [x] *"Kesehatan pilot region, Periode grouping, 30 hari terakhir radio button checked 2 of 3"*.
- [x] Panah kiri → *"Memuat metrik… 7 hari terakhir radio button checked 1 of 3"* — pemuatan
      periode baru diumumkan oleh `WilayahMemuat`, nilai baru tidak dibacakan beruntun.

## Tile (AC "label + nilai + periode", "tren tekstual")

- [x] NVDA `3` → *"Perjalanan pencari kerja, heading level 3"*, lalu penjelasan funnel.
- [x] Tiap tile: *"Pendaftar baru, 30 hari terakhir"* → *"15. Naik 3 dibanding 30 hari
      sebelumnya (12)"*; juga *"Sama dengan…"* dan *"Turun 2…"*. Panah ↑/↓ tidak dibacakan.
- [x] **Cacat ditemukan run 2 & diperbaiki:** angka dan tren terbaca menempel (*"15Naik 3…"*);
      pemisah `sr-only` ditambahkan, dijaga `admin-metrik.test.tsx`. Run 3 benar.
- [~] `<dl>` diumumkan *"list with 10 items"* (pasangan dt/dd dihitung terpisah) — perilaku
      Chrome+NVDA untuk `<dl>`, diterima.

## Tabel pemakaian AI

- [x] NVDA `t` → *"table with 3 rows and 4 columns"* + caption (rentang & retensi 90 hari).
- [x] Navigasi sel membacakan header: *"Obrolan CV row 2 — 1.250"*, *"Token masuk column 3 —
      40.000"*.

## Catatan harness

- Run 1 tidak menguji tile: radio membuat NVDA masuk *focus mode* sehingga perintah jelajah
  mengganti pilihan radio. Harness kini menekan Escape (kembali ke *browse mode*) sesudah
  langkah radio.

## Belum dicakup

- [ ] Auto-refresh dengan NVDA hidup (bahwa refresh 5 menit benar-benar senyap) — dibuktikan
      e2e (fokus tetap; tidak ada live region di atas angka), belum didengar.
