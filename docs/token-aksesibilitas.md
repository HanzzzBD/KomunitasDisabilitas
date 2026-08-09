# Token Aksesibilitas

> Kontrak antara `@nawasena/a11y` dan lapisan tampilan (Tailwind preset, CSS,
> komponen). Ditulis oleh PR-026; **wajib dibaca sebelum menambah gaya yang
> bergantung pada preferensi pengguna.**
>
> Rujukan: ADR-008, SDD §4.3.

## Cara kerjanya

Preferensi pengguna ditulis ke **elemen akar** (`<html>`) sebagai custom
property dan atribut data. Seluruh CSS membaca dari sana.

Bukan lewat prop yang diturunkan komponen: preferensi aksesibilitas harus
berlaku pada **semua** yang tampil, termasuk yang dirender di luar pohon React
(portal, dialog native, konten pihak ketiga). Satu komponen yang lupa
meneruskan prop adalah satu sudut layar yang mengabaikan pengguna.

## Daftar token

### `--font-scale`

Pengali ukuran teks. `1` = normal, `2` = 200%.

```css
font-size: calc(1rem * var(--font-scale, 1));
```

Selalu sediakan nilai cadangan (`, 1`): skrip pra-paint bisa gagal di
lingkungan yang memblokir `localStorage`, dan teks tanpa ukuran lebih buruk
daripada teks berukuran normal.

Batas atas **200%** mengikuti WCAG 2.2 §1.4.4.

### `--touch-target-min`

Ukuran minimum area sentuh: `44px`, atau `56px` bila `largeTouchTargets`.

```css
min-block-size: var(--touch-target-min, 44px);
min-inline-size: var(--touch-target-min, 44px);
```

Berlaku untuk **semua** kontrol interaktif — tombol, tautan yang tampil sebagai
tombol, checkbox, dan area geser.

### `data-contrast="high"`

Ada **hanya** saat kontras tinggi aktif.

```css
[data-contrast="high"] .kartu { border-color: var(--garis-tegas); }
```

### `data-motion="reduced"`

Ada **hanya** saat pengguna meminta pengurangan animasi, atau saat OS
memintanya dan pengguna belum memilih.

```css
[data-motion="reduced"] * { animation: none !important; transition: none !important; }
```

Menggunakan atribut ini, **bukan** `@media (prefers-reduced-motion)` langsung.
Media query hanya tahu setelan OS; atribut ini sudah memperhitungkan pilihan
eksplisit pengguna yang bisa **menimpa** OS.

### `data-lang-mode="simple"`

Ada **hanya** saat mode teks sederhana aktif. Pemilihan teksnya sendiri ditangani
katalog i18n (PR-029); atribut ini untuk penyesuaian tampilan yang menyertainya
(mis. jarak baris lebih longgar).

## Atribut DIHAPUS saat tidak aktif

Tidak ada `data-contrast="normal"`. Konsekuensinya untuk penulis CSS:

* tulis aturan untuk keadaan **aktif** saja;
* keadaan tidak aktif adalah gaya **bawaan** Anda.

`[data-contrast="high"]` lebih mudah dibaca daripada
`:not([data-contrast="normal"])`, dan atribut yang selalu ada mengundang orang
menulis aturan untuk nilai mati yang seharusnya cukup jadi bawaan.

## Preferensi yang TIDAK punya token

`prefersSignLanguage` dan `screenReaderHint` **tidak** muncul di DOM — keduanya
tidak mengubah tampilan. Yang pertama memilih ada atau tidaknya konten BISINDO
(SignBridge, Fase 2–3); yang kedua mengubah teks bantuan yang ditulis komponen.

Komponen yang membutuhkannya membacanya langsung dari store:

```ts
const { prefersSignLanguage } = store.getState().efektif();
```

## Kapan token ditulis

1. **Sebelum halaman tergambar** — skrip pra-paint inline di `<head>` membaca
   `localStorage` dan menulis token. Ini yang mencegah kilasan tampilan yang
   tidak bisa dibaca pengguna.
2. **Setelah React hidup** — `hubungkanKeDom()` menulis ulang nilai yang sama,
   lalu mengambil alih pembaruan berikutnya.

Keduanya memakai aturan yang sama, dan kesetaraannya diuji
(`skrip-pra-paint.test.ts`) dengan menjalankan skripnya lalu membandingkan DOM
hasilnya — bukan membandingkan teks.

## Menambah token baru

1. Tambahkan di `tokenDari()` (`packages/a11y/src/web/token.ts`).
2. Salin aturannya ke `SKRIP_PRA_PAINT` bila ia harus berlaku sebelum paint.
3. Tambahkan bagiannya di dokumen ini — **penjaga CI menolak token yang tidak
   terdokumentasi.**
