# Panduan Menulis Varian `id-simple`

> Mitigasi risiko PR-029: *"Varian simple ditulis asal."*
> Berlaku untuk setiap entri katalog i18n (`apps/web/src/shared/i18n/katalog/`).

## Untuk siapa ini ditulis

Mode teks sederhana ditujukan bagi pengguna **autisme dan disabilitas kognitif** (PRD persona Dimas). Ia juga menolong siapa pun yang sedang lelah, terburu-buru, membaca di layar kecil, atau baru pertama kali memakai aplikasi seperti ini.

Yang penting dipahami: **ini bukan bahasa untuk anak-anak.** Menyederhanakan kalimat bukan merendahkan pembacanya. Nada tetap setara dan hormat.

## Satu kesalahpahaman yang paling mahal

**Sederhana ≠ lebih pendek.**

```
id         : "Memuat halaman…"
id-simple  : "Sebentar, halaman sedang dibuka…"      ← lebih PANJANG, dan lebih baik
```

"Memuat" adalah kata formal yang jarang dipakai sehari-hari. "Sedang dibuka" lebih panjang tetapi langsung dimengerti. Karena itu tidak ada aturan "varian simple harus lebih pendek" — memaksakannya justru mendorong singkatan dan penghilangan kata yang membuat kalimat menggantung.

Yang dikejar adalah **beban berpikir yang lebih ringan**, bukan jumlah karakter yang lebih kecil.

## Aturan menulis

### 1. Satu gagasan per kalimat

```
✗  Perubahan yang Anda buat akan dikirim setelah terhubung kembali, jadi Anda
   tidak perlu mengulanginya.
✓  Perubahan Anda aman. Kami kirim setelah internet menyala.
```

### 2. Pakai kata sehari-hari

| Hindari | Pakai |
|---|---|
| ekosistem, inklusif, optimal | (uraikan maksudnya) |
| memuat, memproses, memvalidasi | membuka, mengerjakan, memeriksa |
| kredensial, autentikasi | kata sandi, masuk |
| terjadi kegagalan sistem | ada yang salah |

```
✗  Ekosistem karier inklusif untuk penyandang disabilitas.
✓  Cari kerja yang ramah untuk penyandang disabilitas.
```

### 3. Kalimat aktif, sebutkan pelakunya

```
✗  Kode akan dikirimkan ke nomor Anda.
✓  Kami kirim kode ke nomor Anda.
```

### 4. Katakan apa yang harus dilakukan, bukan apa yang terjadi di dalam

```
✗  Sesi Anda telah kedaluwarsa.
✓  Masuk lagi untuk melanjutkan.
```

### 5. Tanpa kiasan, sindiran, atau lelucon

"Ups!", "Sepertinya ada yang nyasar", "Jangan khawatir" — semuanya menuntut pembaca menebak maksud di balik kata. Sebut keadaannya apa adanya.

### 6. Jangan hilangkan informasi yang menenangkan

```
id-simple  : "Ini bukan salah Anda. Coba buka ulang halaman ini."
```

"Bukan salah Anda" **bukan basa-basi** — ia informasi. Pengguna yang mengira dirinya salah akan berhenti mencoba. Kalimat semacam ini dipertahankan di kedua varian.

### 7. Angka dan nama tetap apa adanya

Jangan menyederhanakan nomor, kode, nama produk, atau istilah yang muncul di layar lain. Pengguna akan mencocokkannya.

## Kapan kedua varian BOLEH sama

Bila kalimat aslinya memang sudah sesederhana mungkin:

* satu kata umum — `"Masuk"`, `"Simpan"`, `"Batal"`;
* nama produk — `"Nawasena"`;
* label tombol pendek yang sudah memakai kata sehari-hari — `"Coba lagi"`.

**Setiap entri yang identik harus didaftarkan** di `SAMA_DENGAN_SENGAJA` pada `apps/web/__tests__/katalog-kelengkapan.test.ts`, beserta alasannya. Entri identik yang tidak terdaftar membuat CI **merah**.

Itu disengaja: menyalin `id` ke `id-simple` adalah cara termudah membuat katalog "lengkap" tanpa benar-benar menulis varian sederhananya, dan tipe tidak bisa membedakan salinan malas dari kalimat yang memang sudah sederhana. Yang bisa membedakan hanya manusia — jadi penjaganya memaksa manusia itu menuliskan keputusannya.

## Cara memeriksa tulisan Anda

1. **Baca keras-keras.** Kalimat yang membuat Anda kehabisan napas terlalu panjang.
2. **Tanya: apa yang harus dilakukan pembaca setelah membaca ini?** Kalau tidak jelas, kalimatnya belum selesai.
3. **Minta orang non-teknis membacanya** — bagian *Manual Verification* PR-029 memang menuntut ini.

## Yang TIDAK dijamin mesin

Penjaga CI hanya memastikan **kedua varian ada** (dijamin tipe) dan **entri identik sudah diputuskan sadar**. Ia tidak bisa menilai apakah kalimat Anda benar-benar lebih mudah dipahami.

Itu pekerjaan review, dan panduan ini adalah rujukannya.
