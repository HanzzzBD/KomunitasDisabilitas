# PR-035 — Urutan Tab Wizard Onboarding Aksesibilitas

> **PR:** PR-035 — Onboarding Wizard Aksesibilitas (FE)
> **Phase:** [04 — Accessibility Experience](../phase-04-accessibility-experience.md)
> **Tanggal:** 2026-08-16
> **AC yang dipenuhi:** AC PR-035 nomor 3 — "Seluruh wizard bisa diselesaikan
> dengan keyboard saja; urutan Tab terdokumentasi".

Dokumen ini menyebutkan **setiap elemen fokusabel, dalam urutan Tab yang
sesungguhnya**, untuk keempat langkah wizard di `/onboarding`. Daftarnya
diturunkan dari markup yang benar-benar dirender (`apps/web/src/app/tata-letak.tsx`
dan `apps/web/src/features/onboarding/*`), bukan dari rancangan — sehingga
reviewer/QC bisa membukanya di sebelah aplikasi yang berjalan dan mencocokkan
baris per baris.

**Tidak ada satu pun `tabindex` positif di seluruh wizard.** Urutan Tab karena
itu identik dengan urutan DOM, dan tidak ada elemen yang "menyerobot" ke depan.
Ini disengaja: `tabindex` positif memaksa setiap elemen yang ditambahkan kelak
ikut diberi angka, dan angka yang terlewat satu kali sudah cukup untuk membuat
urutannya kacau tanpa gejala yang terlihat.

---

## 0. Kerangka aplikasi — hadir di SETIAP langkah, sebelum isi wizard

Ini berasal dari `TataLetak`, bukan dari wizard, dan karena itu selalu berada di
depan seluruh daftar di bawah.

| # | Elemen | Peran | Aktivasi | Catatan |
|---|---|---|---|---|
| 0.1 | "Lompat ke konten" | tautan | Enter | Elemen fokusabel **pertama** di dokumen. Tersembunyi secara visual (`sr-only`) sampai ia menerima fokus, lalu tampil di kiri atas. Menuju `#konten-utama`. |
| 0.2 | "Coba lagi" | tombol | Enter / Space | **Bersyarat** — hanya ada saat peramban melaporkan luring (`BannerLuring`). Pada keadaan daring elemen ini tidak dirender sama sekali, bukan disembunyikan. |

`<main id="konten-utama">` ber-`tabindex="-1"`: ia **bukan** perhentian Tab,
melainkan sasaran fokus tautan lompat.

---

## 1. Langkah 1 — "Ragam disabilitas"

Isi tak-fokusabel sebelum kendali pertama, dalam urutan baca: `<h1>` "Atur
kenyamanan Anda" → paragraf pengantar → `<nav>` indikator progres (`<ol>` empat
`<li>`, yang aktif ber-`aria-current="step"`) → live region `role="status"`
("Langkah 1 dari 4: Ragam disabilitas") → `<h2>` judul langkah → paragraf
penjelasan → paragraf "Jawaban Anda … belum dikirim ke server kami" → `<legend>`
"Ragam disabilitas Anda (boleh lebih dari satu)".

| # | Elemen | Peran | Aktivasi |
|---|---|---|---|
| 1.1 | "Tuli atau kurang dengar" | kotak centang | Space |
| 1.2 | "Netra atau penglihatan terbatas" | kotak centang | Space |
| 1.3 | "Daksa atau keterbatasan gerak" | kotak centang | Space |
| 1.4 | "Autisme atau disabilitas kognitif" | kotak centang | Space |
| 1.5 | "Lainnya" | kotak centang | Space |
| 1.6 | "Lanjut" | tombol | Enter / Space |
| 1.7 | "Lewati pengaturan ini" | tombol | Enter / Space |

**Tidak ada "Kembali" di langkah pertama** — tombolnya tidak dirender, bukan
dinonaktifkan. Perhentian Tab yang selalu mati adalah perhentian yang membuang
waktu pengguna keyboard tanpa pernah berguna.

---

## 2. Langkah 2 — "Persetujuan"

Isi tak-fokusabel sebelum kendali pertama: `<h2>` "Persetujuan" → paragraf UU PDP
→ daftar tiga butir (`<ul>`).

| # | Elemen | Peran | Aktivasi |
|---|---|---|---|
| 2.1 | "Saya mengizinkan Nawasena memakai data ragam disabilitas saya" | kotak centang | Space |
| 2.2 | "Kembali" | tombol | Enter / Space |
| 2.3 | "Lanjut" | tombol | Enter / Space |
| 2.4 | "Lewati pengaturan ini" | tombol | Enter / Space |

Kotak 2.1 **tidak pernah tercentang saat layarnya muncul** (UU PDP) dan punya
teks bantuan yang tersambung lewat `aria-describedby` ("Kotak ini kosong sampai
Anda sendiri yang mencentangnya"). Teks bantuan bukan perhentian Tab; ia
dibacakan sebagai deskripsi kotaknya.

---

## 3. Langkah 3 — "Preferensi tampilan"

Isi tak-fokusabel sebelum kendali pertama: `<h2>` "Preferensi tampilan" →
paragraf "Setiap perubahan di sini langsung terlihat di layar…" → `<label>`
"Ukuran teks".

| # | Elemen | Peran | Aktivasi |
|---|---|---|---|
| 3.1 | "Ukuran teks" | penggeser (`input[type=range]`, 100–200, langkah 25) | ← / → / ↑ / ↓ (satu langkah = 25), Home (100), End (200), PageUp / PageDown |
| 3.2 | "Kontras tinggi" | kotak centang | Space |
| 3.3 | "Kurangi animasi" | kotak centang | Space |
| 3.4 | "Teks sederhana" | kotak centang | Space |
| 3.5 | "Tombol lebih besar" | kotak centang | Space |
| 3.6 | "Utamakan konten BISINDO" | kotak centang | Space |
| 3.7 | "Saya memakai pembaca layar" | kotak centang | Space |
| 3.8 | "Kembali" | tombol | Enter / Space |
| 3.9 | "Lanjut" | tombol | Enter / Space |
| 3.10 | "Lewati pengaturan ini" | tombol | Enter / Space |

Nilai penggeser juga tampil sebagai teks di `<output>` di sebelahnya
("150 persen"). `<output>` bukan perhentian Tab.

**Dua peringatan bagi yang memverifikasi langkah ini dengan keyboard:**

1. **Menyalakan 3.4 "Teks sederhana" mengganti SELURUH teks layar seketika** —
   itulah pratinjaunya. Nama kendali di tabel ini ikut berubah pada detik itu
   juga: 3.1 → "Besar huruf", 3.2 → "Warna lebih tegas", 3.3 → "Kurangi
   gerakan", 3.6 → "Utamakan video bahasa isyarat", 3.7 → "Saya pakai pembaca
   layar" (3.4 dan 3.5 kebetulan berbunyi sama di kedua mode), dan judul
   langkahnya sendiri menjadi "Tampilan aplikasi". **Urutan dan jumlah
   perhentian Tab tidak berubah sama sekali**, dan fokus tidak berpindah — hanya
   namanya. Verifikasilah 3.4 **terakhir** bila Anda sedang mencocokkan
   nama-nama di tabel ini.
2. **Perubahan di sini langsung berlaku dan TIDAK dikembalikan bila wizard
   kemudian dilewati.** Itu perilaku yang benar (lihat catatan di
   `langkah-preferensi.tsx`), bukan kebocoran: yang dilewati adalah
   penyimpanannya ke akun, bukan pilihan yang sudah pengguna lihat hasilnya.

---

## 4. Langkah 4 — "Ringkasan"

Isi tak-fokusabel: `<h2>` "Ringkasan" → paragraf pengantar → `<h3>` "Preferensi
tampilan" + `<dl>` tujuh baris (`<dt>`/`<dd>`, nilainya berupa KATA "Aktif"/"Tidak
aktif", bukan ikon) → `<h3>` "Ragam disabilitas" + daftar pilihan + keadaan izin
+ penegasan "Bagian ini tidak ikut disimpan ke akun Anda…".

| # | Elemen | Peran | Aktivasi |
|---|---|---|---|
| 4.1 | "Kembali" | tombol | Enter / Space |
| 4.2 | "Simpan dan mulai" | tombol | Enter / Space |
| 4.3 | "Lewati pengaturan ini" | tombol | Enter / Space |

**Langkah ini tidak punya satu pun kendali yang mengubah data** — ia hanya
membaca. Yang ingin mengubah menekan 4.1.

### 4a. Keadaan "sedang menyimpan"

Setelah 4.2 ditekan, tombol yang sama berganti nama menjadi **"Menyimpan pilihan
Anda…"** dan mendapat `aria-disabled="true"` + `aria-busy="true"`.

`aria-disabled`, **bukan** `disabled`: tombol yang benar-benar dinonaktifkan saat
sedang memegang fokus melepaskan fokus itu ke awal dokumen di sebagian peramban —
dan tombol ini pasti sedang memegang fokus, sebab ia baru saja ditekan. Dengan
`aria-disabled`, **posisi dalam urutan Tab tidak berubah** (tetap 4.2) dan fokus
tetap di tempatnya. Klik kedua ditahan oleh penjaga di handler, bukan oleh
peramban.

### 4b. Keadaan "gagal menyimpan"

Bila `PUT /api/v1/me/accessibility` gagal, sebuah `role="alert"` muncul **di atas
baris tombol** (dua paragraf: penyebab + "Pilihan Anda tetap berlaku di perangkat
ini…"). Ia tidak fokusabel dan tidak memindahkan fokus — ia diumumkan di tempat.

Urutan Tab pada keadaan ini:

| # | Elemen | Peran | Aktivasi |
|---|---|---|---|
| 4b.1 | "Kembali" | tombol | Enter / Space |
| 4b.2 | "Lanjutkan ke beranda" | tombol | Enter / Space |
| 4b.3 | "Lewati pengaturan ini" | tombol | Enter / Space |

Tombol "Simpan dan mulai" **diganti**, bukan didampingi: pengguna yang melihat
pesan galat lalu menemukan tombol simpan yang sama akan mengira ia harus
mengulang sampai berhasil. Penandanya sudah tertulis; tidak ada yang perlu
diulang.

---

## 5. Perpindahan fokus antar-langkah

Setiap kali langkahnya berganti (maju **atau** mundur), fokus dipindahkan secara
terprogram ke `<h2>` judul langkah baru (`tabIndex={-1}`, jadi ia bisa menerima
fokus tanpa masuk urutan Tab).

Ini bukan hiasan. Tanpa perpindahan itu, fokus tertinggal di tombol "Lanjut" —
yang letaknya **di bawah** seluruh isi langkah. Tab berikutnya melanjutkan dari
sana, sehingga pengguna keyboard melewati seluruh isi langkah baru tanpa pernah
tahu isi itu ada. Dijaga test: `apps/web/__tests__/onboarding.test.tsx`, "fokus
berpindah ke judul langkah baru, bukan tertinggal di tombol".

Konsekuensi praktis bagi yang memverifikasi: **sesudah menekan "Lanjut", tekanan
Tab pertama membawa Anda ke kendali PERTAMA langkah baru** (mis. 2.1), bukan ke
tombol.

---

## 6. Dua jalur lengkap tanpa tetikus

**Jalur selesai** (dari halaman termuat, fokus di awal dokumen):

```
Tab ×2  → 1.1 (lewati tautan lompat)   Space → centang
Tab ×5  → 1.6 "Lanjut"                 Enter → langkah 2, fokus di <h2>
Tab ×1  → 2.1 kotak persetujuan        Space → centang (opsional)
Tab ×2  → 2.3 "Lanjut"                 Enter → langkah 3, fokus di <h2>
Tab ×1  → 3.1 penggeser                → ×2  → 150 persen
Tab ×1  → 3.2 "Kontras tinggi"         Space → menyala (layar berubah SEKARANG)
Tab ×7  → 3.9 "Lanjut"                 Enter → langkah 4, fokus di <h2>
Tab ×2  → 4.2 "Simpan dan mulai"       Enter → PUT terkirim, mendarat di "/"
```

**Jalur lewati** (dari langkah mana pun):

```
Tab sampai "Lewati pengaturan ini"     Enter → penanda ditulis, mendarat di "/"
```

Tombol "Lewati pengaturan ini" ada di **setiap** langkah dan selalu menjadi
perhentian Tab **terakhir** di baris kendali. Ditaruh terakhir supaya ia tidak
menjadi hal pertama yang tersentuh, tetapi tetap hadir tanpa perlu digali.

Kedua jalur di atas diperiksa otomatis pada dua lapis: keyboard-only di jsdom
(`apps/web/__tests__/onboarding.test.tsx`, "seluruh alur bisa ditempuh tanpa satu
pun klik") dan di peramban sungguhan (`apps/web/e2e/onboarding.spec.ts`).

---

## 7. Yang TIDAK dijamin dokumen ini

* **Urutan pembacaan NVDA.** Urutan Tab dan urutan baca screen reader adalah dua
  hal berbeda; yang kedua ada di
  [`pr-035-nvda-checklist.md`](./pr-035-nvda-checklist.md).
* **Indikator fokus yang terlihat.** Kontras dan ketebalan cincin fokus diukur
  gerbang axe di peramban (`apps/web/e2e/aksesibilitas.spec.ts`, empat entri
  onboarding di `apps/web/e2e/halaman.ts`), bukan di sini.
* **Jebakan fokus.** Wizard ini bukan dialog dan **tidak** menahan fokus: Tab
  dari kendali terakhir keluar ke chrome peramban, sebagaimana mestinya.
