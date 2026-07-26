# Nawasena Design System

## 1. Brand Foundation

**Nawasena — Masa Depan Karier Tanpa Batas** adalah identitas untuk platform karier inklusif yang menghubungkan penyandang disabilitas dengan peluang kerja yang setara, aksesibel, dan sesuai potensi.

Makna Nawasena adalah harapan baru, awal yang baik, dan masa depan yang lebih cerah. Pengalaman produk harus menerjemahkan makna itu menjadi rasa percaya diri, kejelasan, dan kendali bagi setiap pengguna.

### Atribut dan kepribadian

- Inklusif, optimistis, profesional, modern, dan memberdayakan.
- *Human-centered* serta *accessible by design*.
- Ramah dan mendukung, tanpa nada mengasihani.
- Berorientasi pada kesempatan, potensi, pertumbuhan, kesetaraan, dan masa depan.

## 2. Prinsip Pengalaman

1. **Kemampuan lebih dulu.** Tampilkan keterampilan, pengalaman, minat, dan pilihan pengguna sebelum informasi yang bersifat sensitif.
2. **Akses setara sejak awal.** Aksesibilitas bukan mode tambahan: semua alur utama harus dapat dipakai dengan keyboard, pembaca layar, ukuran teks besar, dan preferensi gerak rendah.
3. **Pilihan yang jelas.** Gunakan bahasa sederhana, langkah yang dapat diprediksi, serta kontrol yang memberi pengguna kuasa atas profil dan pengungkapan informasi.
4. **Optimisme yang konkret.** Rayakan kemajuan dengan informasi yang berguna; hindari janji berlebihan atau bahasa yang memosisikan pengguna sebagai objek belas kasihan.
5. **Kepercayaan profesional.** Informasi lowongan, perusahaan, akomodasi, dan status lamaran harus akurat, mudah dipindai, dan dapat ditindaklanjuti.

## 3. Copywriting

Gunakan kalimat langsung, hangat, dan menghormati agensi pengguna.

| Gunakan | Hindari |
| --- | --- |
| “Tunjukkan potensi terbaikmu.” | “Kami membantu keterbatasanmu.” |
| “Temukan peluang yang sesuai dengan preferensimu.” | “Cari pekerjaan meski memiliki hambatan.” |
| “Pilih akomodasi yang mendukung caramu bekerja.” | “Beri tahu kekurangan yang perlu dibantu.” |
| “Langkah berikutnya untuk kariermu.” | “Kesempatan kedua untuk hidupmu.” |

Semua pesan kesalahan menjelaskan masalah dan tindakan berikutnya. Status selalu menyebutkan informasi melalui teks, bukan warna saja.

## 4. Color Tokens

Palet Nawasena memakai hijau-teal yang tenang sebagai sinyal pertumbuhan dan kepercayaan, dengan aksen matahari hangat sebagai simbol harapan. Nilai warna di bawah adalah token awal; implementasi harus memverifikasi kontras WCAG 2.2 AA pada pasangan pemakaian sebenarnya.

| Token | Nilai | Peran |
| --- | --- | --- |
| `--color-primary-700` | `#075C54` | CTA primer, tautan penting, fokus aktif |
| `--color-primary-600` | `#087F6F` | Interaksi primer hover dan penanda aktif |
| `--color-primary-100` | `#DDF5EE` | Latar informasi dan chip positif |
| `--color-accent-600` | `#A85512` | Aksen harapan, bukan pengganti status |
| `--color-accent-100` | `#FEF3C7` | Latar aksen lembut |
| `--color-surface` | `#FFFFFF` | Permukaan utama |
| `--color-surface-subtle` | `#F6FAF8` | Latar halaman dan panel sekunder |
| `--color-text` | `#17211F` | Teks utama |
| `--color-text-muted` | `#4B5B56` | Teks pendukung dengan kontras memadai |
| `--color-border` | `#C9D8D2` | Batas komponen |
| `--color-danger` | `#B42318` | Pesan kesalahan disertai ikon dan teks |

Jangan memakai warna sebagai satu-satunya pembawa makna. Jangan menggunakan gradien dekoratif yang mengurangi keterbacaan.

## 5. Typography and Iconography

- Gunakan keluarga sans-serif yang mudah dibaca, misalnya `Inter, Noto Sans, Arial, sans-serif`; dukung glyph Bahasa Indonesia dan simbol yang dibutuhkan pembaca layar.
- Hierarki minimum: `h1` 32px/40px, `h2` 24px/32px, `h3` 20px/28px, isi 16px/24px, teks pendukung minimal 14px/20px.
- Jangan mengandalkan huruf tipis, semua huruf kapital untuk paragraf, atau pelacakan huruf yang berlebihan.
- Ikon selalu mendampingi label untuk aksi kritis; ikon dekoratif memiliki `aria-hidden="true"`.

## 6. Components

### Buttons and links

- Tombol primer menggunakan `--color-primary-700`, label tindakan yang jelas, dan state fokus yang terlihat.
- Tombol sekunder memakai border, bukan warna abu-abu berkontras rendah.
- Target sentuh minimum 44 × 44px; jangan gunakan area klik berbasis ikon tanpa nama aksesibel.
- Tautan dibedakan dengan teks dan indikator visual selain warna.

### Forms

- Setiap input memiliki `<label>` tetap terlihat, instruksi singkat, dan pesan validasi terkait programatis.
- Kelompok preferensi aksesibilitas menggunakan `fieldset` dan `legend`.
- Jangan meminta informasi disabilitas kecuali diperlukan untuk tujuan yang dijelaskan dan dapat dikendalikan pengguna.

### Cards and data

- Gunakan radius konsisten 8px atau 12px dan border halus; bayangan hanya untuk menandai elevasi nyata.
- Kartu lowongan menonjolkan peran, perusahaan, lokasi/jenis kerja, rentang gaji bila tersedia, dan akomodasi yang ditawarkan.
- Status lamaran memakai teks eksplisit, ikon pendukung, dan warna semantik.

### Empty, loading, and error states

- Nyatakan konteks dan langkah berikutnya: misalnya “Belum ada lowongan yang sesuai filter ini. Ubah filter atau simpan pencarian.”
- Loading konten menggunakan skeleton dengan `aria-busy`; jangan menampilkan spinner tanpa konteks.
- Error menyertakan cara mencoba lagi atau kanal bantuan yang relevan.

## 7. Layout and Responsiveness

- Mulai dari satu kolom pada lebar 320px; perluas secara bertahap pada 768px, 1024px, dan 1440px.
- Gunakan skala jarak 4px: 4, 8, 12, 16, 24, 32, 48, 64.
- Konten utama memiliki lebar baca nyaman dan tidak memaksa zoom horizontal.
- Urutan DOM harus tetap logis ketika grid berubah menjadi satu kolom.

## 8. Accessibility Baseline

- Target minimum WCAG 2.2 Level AA pada seluruh alur utama.
- Semua tindakan dapat diakses keyboard; fokus tidak tertutup dan urutannya sesuai alur visual.
- Hormati `prefers-reduced-motion`; animasi tidak boleh menghalangi pembacaan atau tindakan.
- Media video menyediakan caption; konten gambar bermakna memiliki alternatif teks yang sesuai konteks.
- Uji dengan pembaca layar, pembesaran 200%, mode kontras tinggi, dan perangkat sentuh sebelum rilis.

## 9. Metadata and Content Templates

- **Judul browser:** `Nawasena — Masa Depan Karier Tanpa Batas`.
- **Deskripsi SEO:** `Nawasena adalah platform karier inklusif yang membantu penyandang disabilitas menemukan peluang kerja yang setara, aksesibel, dan sesuai potensi.`
- **Nama pengirim email/notifikasi:** `Nawasena`.
- **Nada notifikasi:** ringkas, jelas, dapat ditindaklanjuti, dan menghormati preferensi aksesibilitas pengguna.

## 10. Review Checklist

- Apakah copy menonjolkan potensi dan kesempatan?
- Apakah informasi dapat dipahami tanpa mengandalkan warna, suara, atau gerak?
- Apakah semua kontrol memiliki nama, fokus, dan target sentuh yang memadai?
- Apakah pasangan warna dan ukuran teks lulus kontras yang relevan?
- Apakah metadata dan nama produk menggunakan Nawasena secara konsisten?
