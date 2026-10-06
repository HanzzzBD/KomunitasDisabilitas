# Aktivasi AI job matching Web/Android

Perbaikan tambahan Phase 19, 6 Oktober 2026.

## Penyebab

API feed dan antarmuka rekomendasi sudah ada, tetapi `ai-embed` dan
`ai-rerank-feed` tidak mempunyai worker aktif. Diagnosis lokal menemukan
satu job profil tertunda, 17 lowongan tayang dan empat profil tanpa embedding,
serta nol `match_scores`. Worker CV dan notifikasi tidak mengonsumsi antrean
matching. Tanpa vektor, feed mengembalikan `profil-belum-siap`.

## Perubahan

Mode `--matching-only` / `dev:matching` mengonsumsi embedding, pengurutan feed,
dan pencatatan penggunaan AI. Mode ini tidak menjadwalkan cron; mode penuh,
CV, dan notifikasi tetap tersedia. Flag campuran atau salah ditolak sebelum
boot. Log startup mencantumkan mode serta antrean yang dikonsumsi.

API dan kontrak Web/Android tetap memakai pipeline matching yang sama:
profil aman dan teks lowongan → Gemini embedding 768 dimensi → kandidat
pgvector → filter akomodasi di server dan skor → pengurutan AI asinkron.
Pengurutan chat memakai gateway dengan provider cadangan yang sudah ada;
embedding tetap memakai satu model agar vektor dapat dibandingkan.

## Menjalankan

API dan worker harus membaca env yang sama. Untuk menjalankan seluruh fitur
di lingkungan dev, gunakan `pnpm dev`. Jika worker CV dan notifikasi sudah
berjalan sendiri, jalankan worker matching pada terminal terpisah:

```powershell
pnpm --filter @nawasena/worker dev:matching
```

Data lama tanpa vektor dipulihkan melalui alat operator yang sudah ada.
Periksa jumlah terlebih dahulu, lalu antrekan dengan batas yang sesuai:

```powershell
pnpm --filter @nawasena/api embed:ulang --maks=21 --jarak-ms=5000 --kering
pnpm --filter @nawasena/api embed:ulang --maks=21 --jarak-ms=5000
```

Alat hanya memilih lowongan aktif berkurator dan profil berisi dari akun hidup
yang belum punya vektor. Coalescing mencegah duplikasi dengan event suntingan.
Worker tetap menerapkan kuota dan pencatatan AI. Jangan mengosongkan vektor
yang sudah ada atau mengubah model saat pemulihan ini.

Sesudah embedding selesai, buka rekomendasi Web atau **Lowongan untuk Anda**
di Android. Jika AI sedang menyusun urutan, pilih **Tampilkan urutan terbaru**
di Web atau **Lihat urutan yang baru** di Android. Tombol ini membaca hasil
tanpa meminta pengurutan AI baru; tombol refresh rekomendasi memakai kuota.
Perbaikan worker berlaku untuk APK yang sudah memakai endpoint matching ini.

Jika halaman sudah terbuka sebelum pemulihan, muat ulang halaman Web atau
pilih **Muat ulang daftar** di Android agar hasil server terbaru terbaca.

## Batas data dan verifikasi

Embedding membaca `findSafeByUserId`: kolom disabilitas, kebutuhan akomodasi,
dan consent tidak ikut dibaca. Builder memakai headline/ringkasan, keahlian,
pengalaman dan pendidikan; teks karier ini dikirim ke Gemini. Filter kebutuhan
akomodasi tetap berlangsung di server lewat jalur audit yang sudah ada.
Tidak ada kredensial, teks profil, token, atau vektor yang masuk dokumentasi/log.

Metadata model pada endpoint resmi Gemini memberikan HTTP 200 dan mendukung
`embedContent`. Konfigurasi lokal tetap `gemini-embedding-001`, 50 embedding
per pengguna per hari, dan 1.200 panggilan AI global per hari.

Tes lokal: pemilihan mode worker sembilan tes, pipeline/API matching 110 tes,
dan feed Web 14 tes lulus. Lint dan typecheck worker lulus.

Sesudah izin operator untuk aktivasi dan pengiriman data karier ke provider,
worker nyata memproses pemulihan hingga 17/17 lowongan tayang dan 4/4 profil
akun hidup mempunyai vektor. Dry run berikutnya memilih nol entitas.
Antrean embedding/re-rank tidak memiliki job menunggu, tertunda, gagal, atau DLQ;
masing-masing mempunyai satu konsumen aktif.

Probe lewat API lokal membuat akun dan profil sintetis, memicu embedding dari
`PUT /me/profile`, lalu membaca `GET /me/matches`: HTTP 200, 11 rekomendasi,
dan 11 penjelasan bersumber AI setelah re-rank selesai. Fixture uji dibersihkan.
Liveness/readiness API memberi 200. Tidak ada perangkat Android terhubung
untuk konfirmasi tampilan langsung; Web/Android memakai endpoint feed yang sama.
